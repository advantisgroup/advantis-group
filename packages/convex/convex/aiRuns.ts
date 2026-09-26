import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  internalMutation,
  mutation,
  query,
  serverMutation,
  serverQuery,
  serverUserMutation,
  serverUserQuery,
  userMutation,
  userQuery,
} from "./functions";
import { AI_RUN_STALE_MS, aiRunKind, aiRunPhase, askSubjectType } from "./lib/aiRuns";
import { isFeatureEnabled } from "./lib/featureFlags";

import { askContext, dailyBriefContext, navigateContext } from "./lib/aiContext";
import { getSessionCaller } from "./lib/caller";
import { displayName } from "./lib/users";

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
    hasTitle: !!run.title,
    transcriptChars: run.transcriptChars ?? null,
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
  const user = (await getSessionCaller(ctx))?.user;
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
    const user = (await getSessionCaller(ctx))?.user;
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
    const user = (await getSessionCaller(ctx))?.user;
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
    const user = (await getSessionCaller(ctx))?.user;
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

/** Everything this person has run in the last 30 days, newest first — the
 * history in Settings → AI, so an answer put away from the dock can still be
 * found again, along with what it was given. */
export const history = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: v.optional(aiRunKind),
  },
  handler: async (ctx, { paginationOpts, kind }) => {
    const user = (await getSessionCaller(ctx))?.user;
    if (!user) return { page: [], isDone: true, continueCursor: "" };
    const result = kind
      ? await ctx.db
          .query("aiRuns")
          .withIndex("by_user_kind", (q) => q.eq("clerkUserId", user.clerkUserId).eq("kind", kind))
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("aiRuns")
          .withIndex("by_user", (q) => q.eq("clerkUserId", user.clerkUserId))
          .order("desc")
          .paginate(paginationOpts);
    return { ...result, page: result.page.map(toMeta) };
  },
});

/** A run and everything hanging off it — transcript and ratings. */
async function deleteRun(ctx: MutationCtx, runId: Id<"aiRuns">) {
  const transcripts = await ctx.db
    .query("aiRunTranscripts")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  for (const row of transcripts) await ctx.db.delete(row._id);
  const ratings = await ctx.db
    .query("aiFeedback")
    .withIndex("by_run_user", (q) => q.eq("runId", runId))
    .collect();
  for (const row of ratings) await ctx.db.delete(row._id);
  await ctx.db.delete(runId);
}

/** Deletes a run for good — the answer, what it was given, and any rating. */
export const remove = mutation({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const owned = await ownRun(ctx, runId);
    if (!owned) return null;
    if (owned.run.status === "running") {
      throw new ConvexError({
        code: "conflict",
        message: "Stop the run before deleting it",
      });
    }
    await deleteRun(ctx, runId);
    return null;
  },
});

export const cancel = mutation({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const owned = await ownRun(ctx, runId);
    if (!owned || owned.run.status !== "running") return null;
    const now = Date.now();
    await ctx.db.patch(runId, { status: "cancelled", finishedAt: now, seenAt: now });
    return null;
  },
});

export const markSeen = mutation({
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

// --- Was it any good? --------------------------------------------------------

/** This person's own verdict on one run, so the panel can show it back. */
export const myFeedback = query({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const user = (await getSessionCaller(ctx))?.user;
    if (!user) return null;
    const row = await ctx.db
      .query("aiFeedback")
      .withIndex("by_run_user", (q) => q.eq("runId", runId).eq("userId", user._id))
      .first();
    return row ? { rating: row.rating, note: row.note ?? null } : null;
  },
});

export const rateRun = userMutation({
  args: {
    runId: v.id("aiRuns"),
    rating: v.union(v.literal("up"), v.literal("down")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { runId, rating, note }) => {
    const user = ctx.caller.user;
    const run = await ctx.db.get(runId);
    // Only your own run — nobody rates an answer they never saw.
    if (!run || run.clerkUserId !== user.clerkUserId) return null;
    const existing = await ctx.db
      .query("aiFeedback")
      .withIndex("by_run_user", (q) => q.eq("runId", runId).eq("userId", user._id))
      .first();
    const trimmed = note?.trim().slice(0, 2000) || undefined;
    if (existing) {
      await ctx.db.patch(existing._id, { rating, note: trimmed, createdAt: Date.now() });
      return null;
    }
    await ctx.db.insert("aiFeedback", {
      runId,
      userId: user._id,
      kind: run.kind,
      rating,
      note: trimmed,
      createdAt: Date.now(),
    });
    return null;
  },
});

// --- Oversight (managers) ----------------------------------------------------

const STATS_WINDOW_MS = 30 * 86_400_000;
const STATS_SCAN_LIMIT = 2000;

/**
 * What AI has actually been doing lately, for the people answerable for it:
 * volume, what failed and why, and what it cost in tokens. Never any content —
 * the output stays ciphertext this layer can't read anyway.
 */
export const stats = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("aiRuns")
      .withIndex("by_started", (q) => q.gt("startedAt", Date.now() - STATS_WINDOW_MS))
      .order("desc")
      .take(STATS_SCAN_LIMIT);

    const byKind = new Map<
      Doc<"aiRuns">["kind"],
      { total: number; failed: number; tokens: number }
    >();
    const byError = new Map<string, number>();
    let failed = 0;
    let tokens = 0;
    for (const run of runs) {
      const kind = byKind.get(run.kind) ?? { total: 0, failed: 0, tokens: 0 };
      kind.total += 1;
      kind.tokens += (run.tokensIn ?? 0) + (run.tokensOut ?? 0);
      tokens += (run.tokensIn ?? 0) + (run.tokensOut ?? 0);
      if (run.status === "error") {
        kind.failed += 1;
        failed += 1;
        const code = run.errorCode ?? "internal";
        byError.set(code, (byError.get(code) ?? 0) + 1);
      }
      byKind.set(run.kind, kind);
    }

    return {
      total: runs.length,
      failed,
      tokens,
      capped: runs.length === STATS_SCAN_LIMIT,
      byKind: [...byKind.entries()]
        .map(([kind, value]) => ({ kind, ...value }))
        .sort((a, b) => b.total - a.total),
      byError: [...byError.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});

export const feedbackList = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("aiFeedback").withIndex("by_created").order("desc").take(200);
    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        userId: row.userId,
        userName: displayName(await ctx.db.get(row.userId)),
        kind: row.kind,
        rating: row.rating,
        note: row.note ?? null,
        createdAt: row.createdAt,
      })),
    );
  },
});

// --- apps/api ----------------------------------------------------------------

export const apiStart = serverUserMutation({
  args: {
    kind: aiRunKind,
    subjectKey: v.string(),
    href: v.optional(v.string()),
    model: v.optional(v.string()),
    title: v.optional(v.string()), // ciphertext
  },
  handler: async (ctx, args) => {
    // The one gate every AI run in the app passes through: with the flag off,
    // nothing new reaches the model, whatever the browser still shows.
    if (!(await isFeatureEnabled(ctx, "ai"))) {
      throw new ConvexError({ code: "disabled", message: "AI is switched off" });
    }
    // Same gate, per person. Its own code so apps/api can say why.
    if (!ctx.caller.can("use_ai")) {
      throw new ConvexError({ code: "no_capability", message: "AI is not enabled for you" });
    }
    const clerkUserId = ctx.caller.user.clerkUserId;
    const now = Date.now();
    const previous = await ctx.db
      .query("aiRuns")
      .withIndex("by_user_subject", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("subjectKey", args.subjectKey),
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
      clerkUserId,
      kind: args.kind,
      subjectKey: args.subjectKey,
      href: args.href,
      model: args.model,
      title: args.title,
      status: "running",
      phase: "reading",
      outputChars: 0,
      startedAt: now,
      heartbeatAt: now,
    });
  },
});

/** Heartbeat + snapshot. Tells the API whether the person pressed stop. */
export const apiProgress = serverMutation({
  args: {
    runId: v.id("aiRuns"),
    phase: aiRunPhase,
    output: v.optional(v.string()),
    outputChars: v.number(),
  },
  handler: async (ctx, { runId, phase, output, outputChars }) => {
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

const transcriptArg = v.object({
  data: v.string(),
  chars: v.number(),
  truncated: v.boolean(),
});

async function saveTranscript(
  ctx: MutationCtx,
  run: Doc<"aiRuns">,
  transcript: { data: string; chars: number; truncated: boolean } | undefined,
) {
  if (!transcript) return;
  await ctx.db.insert("aiRunTranscripts", {
    runId: run._id,
    clerkUserId: run.clerkUserId,
    ...transcript,
    createdAt: Date.now(),
  });
}

export const apiFinish = serverMutation({
  args: {
    runId: v.id("aiRuns"),
    output: v.string(),
    outputChars: v.number(),
    transcript: v.optional(transcriptArg),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    sources: v.optional(v.array(v.object({ label: v.string(), href: v.optional(v.string()) }))),
  },
  handler: async (
    ctx,
    { runId, output, outputChars, transcript, tokensIn, tokensOut, sources },
  ) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") return null;
    const now = Date.now();
    await saveTranscript(ctx, run, transcript);
    await ctx.db.patch(runId, {
      status: "done",
      phase: "finishing",
      output,
      outputChars,
      transcriptChars: transcript?.chars,
      tokensIn,
      tokensOut,
      sources,
      heartbeatAt: now,
      finishedAt: now,
    });
    return null;
  },
});

export const apiFail = serverMutation({
  args: {
    runId: v.id("aiRuns"),
    errorCode: v.string(),
    retryable: v.boolean(),
    // A failed run still shows what it was sent — often the reason it failed.
    transcript: v.optional(transcriptArg),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    sources: v.optional(v.array(v.object({ label: v.string(), href: v.optional(v.string()) }))),
  },
  handler: async (ctx, { runId, errorCode, retryable, transcript, ...recorded }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") return null;
    const now = Date.now();
    await saveTranscript(ctx, run, transcript);
    await ctx.db.patch(runId, {
      ...recorded,
      transcriptChars: transcript?.chars,
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
export const apiGet = serverQuery({
  args: { clerkUserId: v.string(), runId: v.string() },
  handler: async (ctx, { clerkUserId, runId }) => {
    const id = ctx.db.normalizeId("aiRuns", runId);
    const run = id ? await ctx.db.get(id) : null;
    return run && run.clerkUserId === clerkUserId ? run : null;
  },
});

/** The sealed transcript of one run, for the API to decrypt — same ownership
 * check as `apiGet`. */
export const apiTranscript = serverQuery({
  args: { clerkUserId: v.string(), runId: v.string() },
  handler: async (ctx, { clerkUserId, runId }) => {
    const id = ctx.db.normalizeId("aiRuns", runId);
    if (!id) return null;
    const row = await ctx.db
      .query("aiRunTranscripts")
      .withIndex("by_run", (q) => q.eq("runId", id))
      .first();
    return row && row.clerkUserId === clerkUserId ? row : null;
  },
});

// --- Ask in place -----------------------------------------------------------
/** What the ask panel lists before you send anything — the same sources the
 * finished run records, so the chips aren't a separate claim from the truth. */
export const askPreview = userQuery({
  args: { type: askSubjectType, id: v.string() },
  handler: async (ctx, { type, id }) => {
    const { title, href, sources } = await askContext(ctx, ctx.caller, type, id);
    return { title, href, sources };
  },
});

export const apiAskContext = serverUserQuery({
  args: { type: askSubjectType, id: v.string() },
  handler: async (ctx, { type, id }) => askContext(ctx, ctx.caller, type, id),
});
export const apiDailyBriefContext = serverUserQuery({
  args: {},
  handler: async (ctx) => dailyBriefContext(ctx, ctx.caller),
});
export const apiNavigateContext = serverUserQuery({
  args: {},
  handler: async (ctx) => navigateContext(ctx, ctx.caller),
});

export const pruneOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("aiRuns")
      .withIndex("by_started", (q) => q.lt("startedAt", Date.now() - RETENTION_MS))
      .take(200);
    for (const run of old) await deleteRun(ctx, run._id);
    return { deleted: old.length };
  },
});
