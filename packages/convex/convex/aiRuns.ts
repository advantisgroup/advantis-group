import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { isFeatureEnabled } from "./featureFlags";
import { AI_RUN_STALE_MS, aiRunKind, aiRunPhase, askSubjectType } from "./lib/aiRuns";
import {
  getCurrentUser,
  getUserByClerkId,
  hasApplicantAccess,
  requireManager,
  requireUser,
  requireVaultUnlocked,
} from "./lib/auth";
import { sandboxedMutation } from "./lib/sandbox";
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

// --- Was it any good? --------------------------------------------------------

/** This person's own verdict on one run, so the panel can show it back. */
export const myFeedback = query({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const row = await ctx.db
      .query("aiFeedback")
      .withIndex("by_run_user", (q) => q.eq("runId", runId).eq("userId", user._id))
      .first();
    return row ? { rating: row.rating, note: row.note ?? null } : null;
  },
});

export const rateRun = sandboxedMutation({
  args: {
    runId: v.id("aiRuns"),
    rating: v.union(v.literal("up"), v.literal("down")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { runId, rating, note }) => {
    const user = await requireUser(ctx);
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
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireManager(ctx);
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

export const feedbackList = query({
  args: {},
  handler: async (ctx) => {
    await requireManager(ctx);
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
    // The one gate every AI run in the app passes through: with the flag off,
    // nothing new reaches the model, whatever the browser still shows.
    if (!(await isFeatureEnabled(ctx, "ai"))) {
      throw new ConvexError({ code: "disabled", message: "AI is switched off" });
    }
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
    sources: v.optional(v.array(v.object({ label: v.string(), href: v.optional(v.string()) }))),
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

// --- Ask in place -----------------------------------------------------------

/** Nothing longer than this is handed to the model — a record with a huge
 * thread gets its oldest lines dropped rather than an unbounded prompt. */
const ASK_CONTEXT_CHARS = 12_000;

interface AskContext {
  title: string;
  href: string;
  /** The record as plain text, exactly as the model will see it. */
  text: string;
  /** The same thing described for a person: what the panel shows as chips. */
  sources: { label: string; href?: string }[];
}

async function userName(ctx: QueryCtx, userId: Id<"users"> | undefined) {
  return userId ? displayName(await ctx.db.get(userId)) : null;
}

function block(title: string, lines: (string | null | undefined)[]) {
  const kept = lines.filter((line): line is string => !!line);
  return kept.length > 0 ? `## ${title}\n${kept.join("\n")}` : "";
}

async function ticketContext(ctx: QueryCtx, id: string): Promise<AskContext> {
  const ticketId = ctx.db.normalizeId("itTickets", id);
  const ticket = ticketId ? await ctx.db.get(ticketId) : null;
  if (!ticket || !ticketId) {
    throw new ConvexError({ code: "not_found", message: "Ticket not found" });
  }

  const history = await ctx.db
    .query("itTicketStatusHistory")
    .withIndex("by_ticket_and_changedAt", (q) => q.eq("ticketId", ticketId))
    .order("desc")
    .take(20);
  const thread = await ctx.db
    .query("itTicketThreads")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
    .first();
  const messages = thread
    ? (
        await ctx.db
          .query("itTicketMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(60)
      )
        .filter((m) => m.kind === "message" && !m.deletedAt)
        .reverse()
    : [];

  const href = `/it-tickets?open=${ticketId}`;
  const title = ticket.topic?.trim() || `#${ticket.nr}`;
  const text = [
    block("Ticket", [
      `Nummer: #${ticket.nr}`,
      `Status: ${ticket.status}`,
      `Kategorie: ${ticket.category}`,
      `Datum: ${ticket.date}`,
      `Angelegt von: ${ticket.createdByName}`,
      ticket.assignedToUserId
        ? `Zugewiesen an: ${await userName(ctx, ticket.assignedToUserId)}`
        : null,
      ticket.topic ? `Thema: ${ticket.topic}` : null,
      ticket.camId ? `CAM-ID: ${ticket.camId}` : null,
      ticket.custNo ? `Kundennummer: ${ticket.custNo}` : null,
      ticket.info ? `Info: ${ticket.info}` : null,
    ]),
    block(
      "Statusverlauf",
      await Promise.all(
        [...history].reverse().map(async (row) => {
          const when = new Date(row.changedAt).toISOString().slice(0, 10);
          const who = await userName(ctx, row.changedByUserId);
          return `${when}: ${row.previousStatus ?? "—"} → ${row.status} (${who})`;
        }),
      ),
    ),
    block(
      "Thread",
      await Promise.all(
        messages.map(async (m) => {
          const when = new Date(m.createdAt).toISOString().slice(0, 16).replace("T", " ");
          const who = m.kind === "message" ? await userName(ctx, m.senderUserId) : null;
          return m.kind === "message" ? `[${when}] ${who}: ${m.body}` : null;
        }),
      ),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title,
    href,
    text,
    sources: [
      { label: `IT-Ticket #${ticket.nr}`, href },
      ...(history.length > 0 ? [{ label: `Statusverlauf (${history.length})` }] : []),
      ...(messages.length > 0 ? [{ label: `Thread-Nachrichten (${messages.length})` }] : []),
    ],
  };
}

async function applicantContext(
  ctx: QueryCtx,
  user: Doc<"users">,
  id: string,
): Promise<AskContext> {
  if (!hasApplicantAccess(user)) {
    throw new ConvexError({ code: "forbidden", message: "You do not have permission to do that" });
  }
  await requireVaultUnlocked(ctx, user._id);

  const applicantId = ctx.db.normalizeId("applicants", id);
  const applicant = applicantId ? await ctx.db.get(applicantId) : null;
  if (!applicant) {
    throw new ConvexError({ code: "not_found", message: "Applicant not found" });
  }

  const href = `/hr/${applicantId}/uebersicht`;
  const text = [
    block("Bewerber", [
      `Name: ${applicant.name}`,
      applicant.position ? `Position: ${applicant.position}` : null,
      applicant.rating ? `Bewertung: ${applicant.rating}` : null,
      applicant.skills.length > 0 ? `Skills: ${applicant.skills.join(", ")}` : null,
    ]),
    block("Ausbildung", [applicant.ausbildung]),
    block("Berufserfahrung", [applicant.berufserfahrung]),
    block("Zusammenfassung", [applicant.zusammenfassung]),
    block("Interne Notizen", [applicant.notizen]),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title: applicant.name,
    href,
    text,
    sources: [
      { label: applicant.name, href },
      ...(applicant.ausbildung || applicant.berufserfahrung || applicant.zusammenfassung
        ? [{ label: "Lebenslauf-Angaben im Profil" }]
        : []),
      ...(applicant.notizen ? [{ label: "Interne Notizen" }] : []),
    ],
  };
}

/**
 * Everything the model is given about one record, assembled under the asking
 * person's own access — never from anything the browser sent. Contact details
 * are deliberately left out: a question about a record doesn't need someone's
 * address or date of birth to be answered.
 */
async function askContext(
  ctx: QueryCtx,
  user: Doc<"users">,
  type: "itTicket" | "applicant",
  id: string,
): Promise<AskContext> {
  const context =
    type === "itTicket" ? await ticketContext(ctx, id) : await applicantContext(ctx, user, id);
  return { ...context, text: context.text.slice(0, ASK_CONTEXT_CHARS) };
}

/** What the ask panel lists before you send anything — the same sources the
 * finished run records, so the chips aren't a separate claim from the truth. */
export const askPreview = query({
  args: { type: askSubjectType, id: v.string() },
  handler: async (ctx, { type, id }) => {
    const user = await requireUser(ctx);
    const { title, href, sources } = await askContext(ctx, user, type, id);
    return { title, href, sources };
  },
});

export const apiAskContext = query({
  args: { serverKey: v.string(), clerkUserId: v.string(), type: askSubjectType, id: v.string() },
  handler: async (ctx, { serverKey, clerkUserId, type, id }) => {
    assertServerKey(serverKey);
    const user = await getUserByClerkId(ctx, clerkUserId);
    if (!user || user.status === "suspended") {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    return askContext(ctx, user, type, id);
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
