import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { serverUserMutation, userMutation, userQuery } from "../functions";
import { displayName } from "../lib/users";
import { log, normalizeQuestion, requireTrainer } from "./lib";

const OPEN_SCAN = 500;

/** Adds a gap, or counts one more ask of the same open question. */
async function upsertGap(
  ctx: MutationCtx,
  gap: {
    question: string;
    detail?: string;
    source: Doc<"aiTrainingGaps">["source"];
    createdBy?: Id<"users">;
  },
) {
  const question = gap.question.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!question) throw new ConvexError({ code: "bad_request", message: "Empty question" });
  const detail = gap.detail?.trim().slice(0, 2000) || undefined;
  const key = normalizeQuestion(question);
  const now = Date.now();
  const open = await ctx.db
    .query("aiTrainingGaps")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .order("desc")
    .take(OPEN_SCAN);
  const same = open.find((g) => normalizeQuestion(g.question) === key);
  if (same) {
    await ctx.db.patch(same._id, {
      count: same.count + 1,
      updatedAt: now,
      detail: same.detail ?? detail,
    });
    return same._id;
  }
  return await ctx.db.insert("aiTrainingGaps", {
    question,
    detail,
    source: gap.source,
    status: "open",
    count: 1,
    createdBy: gap.createdBy,
    createdAt: now,
    updatedAt: now,
  });
}

export const list = userQuery({
  args: {
    status: v.union(v.literal("open"), v.literal("answered"), v.literal("dismissed")),
  },
  handler: async (ctx, { status }) => {
    requireTrainer(ctx.caller);
    const rows = await ctx.db
      .query("aiTrainingGaps")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(200);
    if (status === "open") rows.sort((a, b) => b.count - a.count || b.updatedAt - a.updatedAt);
    return Promise.all(
      rows.map(async (g) => ({
        _id: g._id,
        question: g.question,
        detail: g.detail ?? null,
        source: g.source,
        status: g.status,
        count: g.count,
        createdByName: g.createdBy ? displayName(await ctx.db.get(g.createdBy)) : null,
        resolvedByName: g.resolvedBy ? displayName(await ctx.db.get(g.resolvedBy)) : null,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        resolvedAt: g.resolvedAt ?? null,
      })),
    );
  },
});

export const add = userMutation({
  args: { question: v.string(), detail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireTrainer(ctx.caller);
    const id = await upsertGap(ctx, { ...args, source: "manual", createdBy: ctx.caller.id });
    await log(ctx, ctx.caller.id, "gap_added", args.question);
    return id;
  },
});

/** "This answer was wrong or missing something" from the chat. Anyone with
 *  AI may send it; who sent it is not kept. */
export const report = userMutation({
  args: { question: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { question, note }) => {
    ctx.caller.require("use_ai");
    await upsertGap(ctx, { question, detail: note, source: "feedback" });
    return null;
  },
});

export const setStatus = userMutation({
  args: {
    gapId: v.id("aiTrainingGaps"),
    status: v.union(v.literal("open"), v.literal("dismissed")),
  },
  handler: async (ctx, { gapId, status }) => {
    requireTrainer(ctx.caller);
    const gap = await ctx.db.get(gapId);
    if (!gap) throw new ConvexError({ code: "not_found", message: "Not found" });
    await ctx.db.patch(gapId, {
      status,
      updatedAt: Date.now(),
      resolvedBy: status === "open" ? undefined : ctx.caller.id,
      resolvedAt: status === "open" ? undefined : Date.now(),
    });
    await log(
      ctx,
      ctx.caller.id,
      status === "open" ? "gap_reopened" : "gap_dismissed",
      gap.question,
    );
    return null;
  },
});

/** The chat assistant found nothing in the wiki for a question. */
export const apiReport = serverUserMutation({
  args: { question: v.string(), detail: v.optional(v.string()) },
  handler: async (ctx, { question, detail }) => {
    await upsertGap(ctx, { question, detail, source: "assistant" });
    return null;
  },
});

/** What a consistency check of the wiki turned up. */
export const apiAddFromCheck = serverUserMutation({
  args: { findings: v.array(v.object({ question: v.string(), detail: v.string() })) },
  handler: async (ctx, { findings }) => {
    requireTrainer(ctx.caller);
    for (const f of findings.slice(0, 40)) {
      await upsertGap(ctx, { ...f, source: "check", createdBy: ctx.caller.id });
    }
    await log(ctx, ctx.caller.id, "check_run", `${findings.length} Funde`);
    return null;
  },
});

export async function markAnswered(ctx: MutationCtx, gapId: Id<"aiTrainingGaps">, by: Id<"users">) {
  const gap = await ctx.db.get(gapId);
  if (!gap || gap.status === "answered") return;
  const now = Date.now();
  await ctx.db.patch(gapId, {
    status: "answered",
    resolvedBy: by,
    resolvedAt: now,
    updatedAt: now,
  });
  await log(ctx, by, "gap_answered", gap.question);
}
