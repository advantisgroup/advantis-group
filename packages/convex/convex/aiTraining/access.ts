import { ConvexError, v } from "convex/values";

import { serverUserQuery, userMutation, userQuery } from "../functions";
import { displayName } from "../lib/users";
import { loadKnowledge, log, requireTrainer } from "./lib";

export const me = userQuery({
  args: {},
  handler: async (ctx) => ({ trainer: ctx.caller.isAiTrainer, admin: ctx.caller.isAdmin }),
});

/** Counts for the tab badges. */
export const overview = userQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.caller.isAiTrainer) return null;
    const gaps = await ctx.db
      .query("aiTrainingGaps")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(500);
    const proposals = await ctx.db
      .query("aiTrainingProposals")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(500);
    return { openGaps: gaps.length, openProposals: proposals.length };
  },
});

export const activity = userQuery({
  args: {},
  handler: async (ctx) => {
    requireTrainer(ctx.caller);
    const rows = await ctx.db.query("aiTrainingLog").withIndex("by_at").order("desc").take(200);
    return Promise.all(
      rows.map(async (r) => ({
        _id: r._id,
        actorName: displayName(await ctx.db.get(r.actorId)),
        action: r.action,
        target: r.target,
        detail: r.detail ?? null,
        href: r.href ?? null,
        at: r.at,
      })),
    );
  },
});

/** Who may train: everyone active, flagged. Admins always can. */
export const trainers = userQuery({
  args: {},
  handler: async (ctx) => {
    requireTrainer(ctx.caller);
    const users = (await ctx.db.query("users").collect()).filter(
      (u) => u.status === "active" && !u.external,
    );
    return users
      .map((u) => ({
        _id: u._id,
        name: displayName(u),
        admin: u.role === "admin",
        trainer: u.role === "admin" || u.aiTrainer === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const setTrainer = userMutation({
  role: "admin",
  args: { userId: v.id("users"), trainer: v.boolean() },
  handler: async (ctx, { userId, trainer }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.status !== "active") {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.patch(userId, { aiTrainer: trainer || undefined });
    await log(
      ctx,
      ctx.caller.id,
      trainer ? "trainer_granted" : "trainer_revoked",
      displayName(user),
    );
    return null;
  },
});

/** The assistant's whole knowledge for one run, read with the asker's access. */
export const apiKnowledge = serverUserQuery({
  args: {},
  handler: async (ctx) => loadKnowledge(ctx, ctx.caller),
});

/** For apps/api routes that do expensive work before their first write. */
export const apiRequireTrainer = serverUserQuery({
  args: {},
  handler: async (ctx) => {
    requireTrainer(ctx.caller);
    return null;
  },
});
