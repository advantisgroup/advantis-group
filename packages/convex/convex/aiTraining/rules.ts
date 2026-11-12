import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";
import { displayName } from "../lib/users";
import { DEFAULT_BRIEFING, DEFAULT_BRIEFING_TITLE, log, requireTrainer } from "./lib";

export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    requireTrainer(ctx.caller);
    const rows = await ctx.db.query("aiTrainingRules").collect();
    const out = await Promise.all(
      rows.map(async (r) => ({
        _id: r._id as string,
        title: r.title,
        text: r.text,
        active: r.active,
        builtin: r.builtin ?? false,
        updatedByName: displayName(await ctx.db.get(r.updatedBy)),
        updatedAt: r.updatedAt as number | null,
      })),
    );
    if (!rows.some((r) => r.builtin)) {
      out.unshift({
        _id: "builtin",
        title: DEFAULT_BRIEFING_TITLE,
        text: DEFAULT_BRIEFING,
        active: true,
        builtin: true,
        updatedByName: "",
        updatedAt: null,
      });
    }
    return out.sort(
      (a, b) => Number(b.builtin) - Number(a.builtin) || a.title.localeCompare(b.title),
    );
  },
});

/** `ruleId` "builtin" saves the briefing that still lives in code as a row. */
export const save = userMutation({
  args: {
    ruleId: v.optional(v.string()),
    title: v.string(),
    text: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, { ruleId, title, text, active }) => {
    requireTrainer(ctx.caller);
    const name = title.trim().slice(0, 120);
    const body = text.trim().slice(0, 20_000);
    if (!name || !body)
      throw new ConvexError({ code: "bad_request", message: "Title and text are required" });
    const now = Date.now();
    const id =
      ruleId && ruleId !== "builtin" ? ctx.db.normalizeId("aiTrainingRules", ruleId) : null;
    const builtinRow =
      ruleId === "builtin"
        ? (await ctx.db.query("aiTrainingRules").collect()).find((r) => r.builtin)
        : null;
    const target = id ? await ctx.db.get(id) : builtinRow;
    if (ruleId && ruleId !== "builtin" && !target) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    if (target) {
      await ctx.db.patch(target._id, {
        title: name,
        text: body,
        active,
        updatedBy: ctx.caller.id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("aiTrainingRules", {
        title: name,
        text: body,
        active,
        builtin: ruleId === "builtin" ? true : undefined,
        createdBy: ctx.caller.id,
        updatedBy: ctx.caller.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await log(ctx, ctx.caller.id, "rule_saved", name, {
      detail: active ? undefined : "inaktiv",
      href: "/ki-pflege/regeln",
    });
    return null;
  },
});

/** Hard delete — the log keeps the text, so it can be put back by hand. */
export const remove = userMutation({
  args: { ruleId: v.id("aiTrainingRules") },
  handler: async (ctx, { ruleId }) => {
    requireTrainer(ctx.caller);
    const rule = await ctx.db.get(ruleId);
    if (!rule) return null;
    if (rule.builtin) {
      throw new ConvexError({ code: "bad_request", message: "Switch the briefing off instead" });
    }
    await ctx.db.delete(ruleId);
    await log(ctx, ctx.caller.id, "rule_deleted", rule.title, { detail: rule.text });
    return null;
  },
});
