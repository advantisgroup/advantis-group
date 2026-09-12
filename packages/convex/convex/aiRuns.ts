import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { AI_RUN_STALE_MS, aiRunKind, aiRunPhase } from "./lib/aiRuns";
import { getCurrentUser } from "./lib/auth";
import { sandboxedMutation } from "./lib/sandbox";

/**
 * One row per AI call anywhere in the intranet, so an answer outlives the tab
 * that asked for it.
 *
 * apps/api opens the row, replies to the browser straight away and keeps
 * working in the background, pushing progress here. The browser subscribes to
 * the row (status, phase, heartbeat) and fetches the actual text from apps/api
 * whenever it moves: `output` is ciphertext sealed with a key only the API
 * holds, same as wikiChats and Sales Coach transcripts, so nothing readable
 * ever sits in this table.
 */

const RETENTION_MS = 30 * 86_400_000;
const DOCK_WINDOW_MS = 86_400_000;

function assertServerKey(serverKey: string) {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

/** Everything but the ciphertext — the browser never needs it from here. */
function toMeta(run: Doc<"aiRuns">) {
  return {
    _id: run._id,
    kind: run.kind,
    subjectKey: run.subjectKey,
    href: run.href ?? null,
    status: run.status,
    phase: run.phase,
    outputChars: run.outputChars,
    model: run.model ?? null,
    tokensIn: run.tokensIn ?? null,
    tokensOut: run.tokensOut ?? null,
    sources: run.sources ?? [],
    errorCode: run.errorCode ?? null,
    retryable: run.retryable ?? false,
    startedAt: run.startedAt,
    heartbeatAt: run.heartbeatAt,
    finishedAt: run.finishedAt ?? null,
    seenAt: run.seenAt ?? null,
  };
}

export type AiRunMeta = ReturnType<typeof toMeta>;

async function ownRun(ctx: QueryCtx, runId: Id<"aiRuns">) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const run = await ctx.db.get(runId);
  return run && run.clerkUserId === user.clerkUserId ? { user, run } : null;
}

// --- Browser ----------------------------------------------------------------

export const get = query({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const owned = await ownRun(ctx, runId);
    return owned ? toMeta(owned.run) : null;
  },
});

/** The newest run for one subject — "is this chat/entry/call being worked on". */
export const latest = query({
  args: { subjectKey: v.string() },
  handler: async (ctx, { subjectKey }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const run = await ctx.db
      .query("aiRuns")
      .withIndex("by_user_subject", (q) =>
        q.eq("clerkUserId", user.clerkUserId).eq("subjectKey", subjectKey),
      )
      .order("desc")
      .first();
    return run ? toMeta(run) : null;
  },
});

/** Recent runs of one kind, newest first — the CV import tray lists these. */
export const recent = query({
  args: { kind: aiRunKind, limit: v.optional(v.number()) },
  handler: async (ctx, { kind, limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const runs = await ctx.db
      .query("aiRuns")
      .withIndex("by_user_kind", (q) => q.eq("clerkUserId", user.clerkUserId).eq("kind", kind))
      .order("desc")
      .take(Math.min(limit ?? 20, 50));
    return runs.map(toMeta);
  },
});

/** What the app-wide dock shows: anything still working, plus finished runs
 * nobody has looked at yet. */
export const dock = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const runs = await ctx.db
      .query("aiRuns")
      .withIndex("by_user", (q) => q.eq("clerkUserId", user.clerkUserId))
      .order("desc")
      .take(25);
    const cutoff = Date.now() - DOCK_WINDOW_MS;
    return runs
      .filter((r) => r.startedAt > cutoff && (r.status === "running" || !r.seenAt))
      .map(toMeta);
  },
});

export const cancel = sandboxedMutation({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const owned = await ownRun(ctx, runId);
    if (!owned || owned.run.status !== "running") return null;
    const now = Date.now();
    await ctx.db.patch(runId, { status: "cancelled", finishedAt: now, seenAt: now });
    return null;
  },
});

export const markSeen = sandboxedMutation({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const owned = await ownRun(ctx, runId);
    if (!owned || owned.run.seenAt) return null;
    const now = Date.now();
    if (owned.run.status === "running") {
      // Only a run whose API function is gone can be put away while
      // "running" — settle it as interrupted so it can't come back.
      if (now - owned.run.heartbeatAt < AI_RUN_STALE_MS) return null;
      await ctx.db.patch(runId, {
        status: "error",
        errorCode: "interrupted",
        retryable: true,
        finishedAt: now,
        seenAt: now,
      });
      return null;
    }
    await ctx.db.patch(runId, { seenAt: now });
    return null;
  },
});

// --- apps/api ----------------------------------------------------------------

export const apiStart = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    kind: aiRunKind,
    subjectKey: v.string(),
    href: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const now = Date.now();
    const previous = await ctx.db
      .query("aiRuns")
      .withIndex("by_user_subject", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("subjectKey", args.subjectKey),
      )
      .order("desc")
      .first();
    if (previous?.status === "running") {
      if (now - previous.heartbeatAt < AI_RUN_STALE_MS) {
        throw new ConvexError({ code: "conflict", message: "Already running" });
      }
      await ctx.db.patch(previous._id, {
        status: "error",
        errorCode: "interrupted",
        retryable: true,
        finishedAt: now,
      });
    }
    return await ctx.db.insert("aiRuns", {
      clerkUserId: args.clerkUserId,
      kind: args.kind,
      subjectKey: args.subjectKey,
      href: args.href,
      model: args.model,
      status: "running",
      phase: "reading",
      outputChars: 0,
      startedAt: now,
      heartbeatAt: now,
    });
  },
});

/** Heartbeat + snapshot. Tells the API whether the person pressed stop. */
export const apiProgress = mutation({
  args: {
    serverKey: v.string(),
    runId: v.id("aiRuns"),
    phase: aiRunPhase,
    output: v.optional(v.string()),
    outputChars: v.number(),
  },
  handler: async (ctx, { serverKey, runId, phase, output, outputChars }) => {
    assertServerKey(serverKey);
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") return { cancelled: true };
    await ctx.db.patch(runId, {
      phase,
      outputChars,
      heartbeatAt: Date.now(),
      ...(output !== undefined ? { output } : {}),
    });
    return { cancelled: false };
  },
});

export const apiFinish = mutation({
  args: {
    serverKey: v.string(),
    runId: v.id("aiRuns"),
    output: v.string(),
    outputChars: v.number(),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    sources: v.optional(
      v.array(v.object({ label: v.string(), href: v.optional(v.string()) })),
    ),
  },
  handler: async (ctx, { serverKey, runId, output, outputChars, tokensIn, tokensOut, sources }) => {
    assertServerKey(serverKey);
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") return null;
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: "done",
      phase: "finishing",
      output,
      outputChars,
      tokensIn,
      tokensOut,
      sources,
      heartbeatAt: now,
      finishedAt: now,
    });
    return null;
  },
});

export const apiFail = mutation({
  args: {
    serverKey: v.string(),
    runId: v.id("aiRuns"),
    errorCode: v.string(),
    retryable: v.boolean(),
  },
  handler: async (ctx, { serverKey, runId, errorCode, retryable }) => {
    assertServerKey(serverKey);
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") return null;
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: "error",
      errorCode,
      retryable,
      heartbeatAt: now,
      finishedAt: now,
    });
    return null;
  },
});

/** The full row, ciphertext included, for the API to decrypt. `runId` is a
 * plain string because it arrives straight from a URL. */
export const apiGet = query({
  args: { serverKey: v.string(), clerkUserId: v.string(), runId: v.string() },
  handler: async (ctx, { serverKey, clerkUserId, runId }) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("aiRuns", runId);
    const run = id ? await ctx.db.get(id) : null;
    return run && run.clerkUserId === clerkUserId ? run : null;
  },
});

export const pruneOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("aiRuns")
      .withIndex("by_started", (q) => q.lt("startedAt", Date.now() - RETENTION_MS))
      .take(500);
    for (const run of old) await ctx.db.delete(run._id);
    return { deleted: old.length };
  },
});
