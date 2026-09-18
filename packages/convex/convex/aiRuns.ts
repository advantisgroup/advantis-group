import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, serverMutation, serverQuery } from "./functions";
import { type QueryCtx } from "./_generated/server";
import { isFeatureEnabled } from "./lib/featureFlags";
import { AI_RUN_STALE_MS, aiRunKind, aiRunPhase, askSubjectType } from "./lib/aiRuns";
import {
  effectiveCustomRoleIds,
  effectiveRole,
  getCurrentUser,
  getUserByClerkId,
  hasApplicantAccess,
  isOwnerOrAdmin,
  requireManager,
  requireUser,
  requireVaultUnlocked,
  userHasCapability,
} from "./lib/auth";
import { userMatchesAudience } from "./lib/audience";
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
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const row = await ctx.db
      .query("aiFeedback")
      .withIndex("by_run_user", (q) => q.eq("runId", runId).eq("userId", user._id))
      .first();
    return row ? { rating: row.rating, note: row.note ?? null } : null;
  },
});

export const rateRun = mutation({
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

export const apiStart = serverMutation({
  args: {
    clerkUserId: v.string(),
    kind: aiRunKind,
    subjectKey: v.string(),
    href: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The one gate every AI run in the app passes through: with the flag off,
    // nothing new reaches the model, whatever the browser still shows.
    if (!(await isFeatureEnabled(ctx, "ai"))) {
      throw new ConvexError({ code: "disabled", message: "AI is switched off" });
    }
    // Same gate, per person. `ctx.auth` isn't the caller here (apps/api calls
    // this with the server key), so the capability is resolved from the
    // clerk id it forwarded — managers and admins pass on their tier.
    const caller = await getUserByClerkId(ctx, args.clerkUserId);
    if (!caller || caller.status === "suspended") {
      throw new ConvexError({ code: "forbidden", message: "No account" });
    }
    const callerRoles = await Promise.all(
      effectiveCustomRoleIds(caller).map((id) => ctx.db.get(id)),
    );
    if (!userHasCapability(caller, callerRoles, "use_ai")) {
      throw new ConvexError({ code: "no_capability", message: "AI is not enabled for you" });
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

export const apiFinish = serverMutation({
  args: {
    runId: v.id("aiRuns"),
    output: v.string(),
    outputChars: v.number(),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    sources: v.optional(v.array(v.object({ label: v.string(), href: v.optional(v.string()) }))),
  },
  handler: async (ctx, { runId, output, outputChars, tokensIn, tokensOut, sources }) => {
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

export const apiFail = serverMutation({
  args: {
    runId: v.id("aiRuns"),
    errorCode: v.string(),
    retryable: v.boolean(),
  },
  handler: async (ctx, { runId, errorCode, retryable }) => {
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
export const apiGet = serverQuery({
  args: { clerkUserId: v.string(), runId: v.string() },
  handler: async (ctx, { clerkUserId, runId }) => {
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

function plainText(html: string) {
  return html
    .replace(/<(br|\/p|\/li|\/h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function announcementContext(
  ctx: QueryCtx,
  user: Doc<"users">,
  id: string,
): Promise<AskContext> {
  const announcementId = ctx.db.normalizeId("announcements", id);
  const a = announcementId ? await ctx.db.get(announcementId) : null;
  const owner = a ? (a.ownerUserId ?? a.authorUserId) : null;
  const canSee =
    !!a &&
    (isOwnerOrAdmin(user, owner!) ||
      (userMatchesAudience(user, a.audience) &&
        a.publishedAt <= Date.now() &&
        (!a.expiresAt || a.expiresAt > Date.now())));
  if (!a || !canSee) {
    throw new ConvexError({ code: "not_found", message: "Announcement not found" });
  }
  const href = `/announcements?id=${a._id}`;
  return {
    title: a.title,
    href,
    text: [
      block("Ankündigung", [
        `Titel: ${a.title}`,
        `Veröffentlicht: ${new Date(a.publishedAt).toISOString().slice(0, 10)}`,
        `Von: ${await userName(ctx, a.authorUserId)}`,
        a.category ? `Kategorie: ${a.category}` : null,
      ]),
      block("Text", [plainText(a.body)]),
    ]
      .filter(Boolean)
      .join("\n\n"),
    sources: [{ label: a.title, href }],
  };
}

async function errorReportContext(ctx: QueryCtx, id: string): Promise<AskContext> {
  const reportId = ctx.db.normalizeId("errorReports", id);
  const report = reportId ? await ctx.db.get(reportId) : null;
  if (!report || !reportId) {
    throw new ConvexError({ code: "not_found", message: "Error report not found" });
  }
  const measures = await ctx.db
    .query("errorMeasures")
    .withIndex("by_error", (q) => q.eq("errorReportId", reportId))
    .collect();
  const href = `/fehlermanagement?open=${reportId}`;
  const title = report.description.slice(0, 80);
  return {
    title,
    href,
    text: [
      block("Fehlermeldung", [
        `Beschreibung: ${report.description}`,
        report.categoryName ? `Kategorie: ${report.categoryName}` : null,
        `Schwere: ${report.severity}`,
        `Status: ${report.status}`,
        `Erfasst: ${new Date(report.createdAt).toISOString().slice(0, 10)}`,
        report.customerOrProject ? `Kunde/Projekt: ${report.customerOrProject}` : null,
        report.responsibleName ? `Verantwortlich: ${report.responsibleName}` : null,
        report.prevention ? `Vorbeugung: ${report.prevention}` : null,
        report.customerFeedback ? `Kundenfeedback: ${report.customerFeedback}` : null,
      ]),
      block(
        "Maßnahmen",
        measures.map(
          (m) =>
            `- [${m.status}] ${m.phase}: ${m.description}${m.dueAt ? ` (fällig ${new Date(m.dueAt).toISOString().slice(0, 10)})` : ""}`,
        ),
      ),
    ]
      .filter(Boolean)
      .join("\n\n"),
    sources: [
      { label: title, href },
      ...(measures.length > 0 ? [{ label: `Maßnahmen (${measures.length})` }] : []),
    ],
  };
}

async function suggestionContext(ctx: QueryCtx, id: string): Promise<AskContext> {
  const suggestionId = ctx.db.normalizeId("suggestions", id);
  const s = suggestionId ? await ctx.db.get(suggestionId) : null;
  if (!s || !suggestionId) {
    throw new ConvexError({ code: "not_found", message: "Suggestion not found" });
  }
  const category = await ctx.db.get(s.categoryId);
  const votes = await ctx.db
    .query("suggestionVotes")
    .withIndex("by_suggestion", (q) => q.eq("suggestionId", suggestionId))
    .collect();
  const href = `/suggestions?open=${suggestionId}`;
  return {
    title: s.title,
    href,
    text: block("Vorschlag", [
      `Titel: ${s.title}`,
      `Von: ${await userName(ctx, s.authorUserId)}`,
      category ? `Kategorie: ${category.name}` : null,
      `Status: ${s.status}`,
      s.outcome ? `Ergebnis: ${s.outcome}` : null,
      `Unterstützer: ${votes.length}`,
      s.explanation ? `Erklärung: ${s.explanation}` : null,
      s.decisionNote ? `Entscheidungsnotiz: ${s.decisionNote}` : null,
    ]),
    sources: [{ label: s.title, href }],
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
  type: "itTicket" | "applicant" | "announcement" | "errorReport" | "suggestion",
  id: string,
): Promise<AskContext> {
  const context =
    type === "itTicket"
      ? await ticketContext(ctx, id)
      : type === "applicant"
        ? await applicantContext(ctx, user, id)
        : type === "announcement"
          ? await announcementContext(ctx, user, id)
          : type === "errorReport"
            ? await errorReportContext(ctx, id)
            : await suggestionContext(ctx, id);
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

export const apiAskContext = serverQuery({
  args: { clerkUserId: v.string(), type: askSubjectType, id: v.string() },
  handler: async (ctx, { clerkUserId, type, id }) => {
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

const BERLIN = "Europe/Berlin";
const DAY_MS = 86_400_000;

function berlinTime(ms: number) {
  return new Date(ms).toLocaleString("de-DE", {
    timeZone: BERLIN,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The same things the overview page already shows this person — their open
 * work, today's and tomorrow's events, what's waiting to be read — as one
 * plain block for the daily brief. Nothing here is beyond what they can
 * already see on the page.
 */
async function dailyBriefContext(ctx: QueryCtx, user: Doc<"users">) {
  const now = Date.now();
  const sources: { label: string; href?: string }[] = [];

  const assigned = (
    await ctx.db
      .query("itTickets")
      .withIndex("by_assignee", (q) => q.eq("assignedToUserId", user._id))
      .collect()
  ).filter((t) => t.status !== "closed");
  const mine = (
    await ctx.db
      .query("itTickets")
      .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
      .collect()
  ).filter((t) => t.status !== "closed");
  if (assigned.length || mine.length) sources.push({ label: "IT-Tickets", href: "/it-tickets" });

  const measures = (
    await ctx.db
      .query("errorMeasures")
      .withIndex("by_status", (q) => q.eq("status", "offen"))
      .collect()
  ).filter((m) => m.ownerUserId === user._id);
  if (measures.length) {
    sources.push({ label: "Maßnahmen", href: "/fehlermanagement/measures" });
  }

  const events = (
    await ctx.db
      .query("events")
      .withIndex("by_start", (q) => q.lte("start", now + 2 * DAY_MS))
      .collect()
  )
    .filter(
      (e) =>
        !e.dismissedAt && e.end >= now - 12 * 3_600_000 && userMatchesAudience(user, e.audience),
    )
    .sort((a, b) => a.start - b.start)
    .slice(0, 12);
  if (events.length) sources.push({ label: "Kalender", href: "/calendar" });

  const announcements = (
    await ctx.db.query("announcements").withIndex("by_publishedAt").order("desc").take(50)
  ).filter(
    (a) =>
      a.publishedAt <= now &&
      (!a.expiresAt || a.expiresAt > now) &&
      (isOwnerOrAdmin(user, a.ownerUserId ?? a.authorUserId) ||
        userMatchesAudience(user, a.audience)),
  );
  const openAnnouncements = (
    await Promise.all(
      announcements.map(async (a) => {
        const recent = now - a.publishedAt < 3 * DAY_MS;
        if (!recent && !a.pinned && !a.requiresAck) return null;
        const done = await ctx.db
          .query(a.requiresAck ? "announcementAcks" : "announcementReads")
          .withIndex("by_announcement_user", (q) =>
            q.eq("announcementId", a._id).eq("userId", user._id),
          )
          .first();
        return done ? null : a;
      }),
    )
  ).filter((a): a is Doc<"announcements"> => a !== null);
  if (openAnnouncements.length) sources.push({ label: "Ankündigungen", href: "/announcements" });

  const memberships = await ctx.db
    .query("conversationMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const unreadChats = memberships.filter((m) => !m.leftAt && (m.unreadCount ?? 0) > 0);
  const unreadMessages = unreadChats.reduce((sum, m) => sum + (m.unreadCount ?? 0), 0);
  if (unreadChats.length) sources.push({ label: "Chats", href: "/chat" });

  const days = (ms: number) => Math.floor((now - ms) / DAY_MS);
  const text = [
    block("Person", [
      `Vorname: ${user.firstName ?? displayName(user)}`,
      `Jetzt: ${berlinTime(now)}`,
    ]),
    block(
      "IT-Tickets, die dir zugewiesen sind",
      assigned.map(
        (t) =>
          `- #${t.nr} ${t.topic?.trim() || t.category} (Status: ${t.status}, von ${t.createdByName}, seit ${days(t.createdAt)} Tagen)`,
      ),
    ),
    block(
      "Deine eigenen offenen IT-Tickets",
      mine.map((t) => `- #${t.nr} ${t.topic?.trim() || t.category} (Status: ${t.status})`),
    ),
    block(
      "Deine offenen Maßnahmen",
      measures.map(
        (m) =>
          `- ${m.description.slice(0, 200)}${m.dueAt ? ` (fällig ${berlinTime(m.dueAt)}${m.dueAt < now ? ", überfällig" : ""})` : ""}`,
      ),
    ),
    block(
      "Termine heute und morgen",
      events.map(
        (e) =>
          `- ${e.title}: ${e.allDay ? "ganztägig" : berlinTime(e.start)}${e.location ? `, ${e.location}` : ""}`,
      ),
    ),
    block(
      "Ungelesene oder zu bestätigende Ankündigungen",
      openAnnouncements
        .slice(0, 8)
        .map(
          (a) =>
            `- ${a.title}${a.requiresAck ? " (Bestätigung nötig)" : a.pinned ? " (angeheftet)" : ""}`,
        ),
    ),
    block("Chats", [
      unreadChats.length
        ? `${unreadMessages} ungelesene Nachrichten in ${unreadChats.length} Unterhaltungen`
        : null,
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { text: text.slice(0, ASK_CONTEXT_CHARS), sources };
}

export const apiDailyBriefContext = serverQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await getUserByClerkId(ctx, clerkUserId);
    if (!user || user.status === "suspended") {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    return dailyBriefContext(ctx, user);
  },
});

/**
 * What the "find your way around" helper is allowed to point at: the static
 * pages this person can actually see, plus a handful of their own recent IT
 * tickets. The model picks a `key` from this list — never a raw href — and
 * `hrefByKey` is how the API route turns that back into a real path, so a
 * garbled model reply can only ever fail closed, not link somewhere unlisted.
 */
async function navigateContext(ctx: QueryCtx, user: Doc<"users">) {
  const role = effectiveRole(user);
  const isManagerOrAdmin = role === "admin" || role === "manager";
  const applicantAccess = hasApplicantAccess(user);

  const pages: { href: string; label: string }[] = [
    { href: "/", label: "Startseite / Übersicht" },
    { href: "/calendar", label: "Kalender" },
    ...(user.clockodoUserId
      ? [{ href: "/clockodo", label: "Abwesenheiten / Urlaub (Clockodo)" }]
      : []),
    { href: "/announcements", label: "Ankündigungen" },
    { href: "/chat", label: "Chat" },
    { href: "/guidebooks", label: "Guidebooks / Wiki" },
    { href: "/directory", label: "Personenverzeichnis" },
    { href: "/suggestions", label: "Vorschläge" },
    { href: "/suggestions?new=1", label: "Neuen Vorschlag einreichen" },
    { href: "/it-tickets", label: "IT-Tickets" },
    { href: "/it-tickets?new=1", label: "Neues IT-Ticket melden" },
    { href: "/fehlermanagement", label: "Fehlermanagement (Qualität, QVM)" },
    { href: "/fehlermanagement?new=1", label: "Neue Fehlermeldung erfassen" },
    ...(applicantAccess ? [{ href: "/hr", label: "Bewerbermanagement" }] : []),
    { href: "/settings", label: "Kontoeinstellungen" },
    { href: "/settings/ai", label: "KI-Einstellungen & Datenschutz" },
    ...(isManagerOrAdmin
      ? [
          { href: "/admin", label: "Adminbereich" },
          { href: "/admin/password-resets", label: "Warteschlange für Passwort-Zurücksetzungen" },
          { href: "/admin/members", label: "Mitglieder / Benutzerkonten verwalten" },
          { href: "/admin/roles", label: "Benutzerdefinierte Rollen & Rechte" },
          { href: "/admin/teams", label: "Teams" },
          { href: "/admin/departments", label: "Abteilungen" },
          {
            href: "/admin/integrations",
            label: "Integrationen (Clockodo, Genesys, OneDrive, ...)",
          },
          { href: "/admin/feature-flags", label: "Feature-Flags" },
          { href: "/admin/audit", label: "Audit-Log" },
          { href: "/admin/invites", label: "Einladungen" },
          { href: "/admin/authentication", label: "Authentifizierungseinstellungen" },
          { href: "/admin/requests", label: "Zugriffsanfragen" },
          { href: "/admin/onboard", label: "Neue Mitarbeitende onboarden" },
          { href: "/admin/uploads", label: "Uploads" },
          { href: "/admin/design-feedback", label: "Design-Feedback" },
          { href: "/admin/ai", label: "KI-Aktivität im Intranet" },
        ]
      : []),
  ];

  const myTickets = await ctx.db
    .query("itTickets")
    .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
    .order("desc")
    .take(5);
  const assignedTickets = await ctx.db
    .query("itTickets")
    .withIndex("by_assignee", (q) => q.eq("assignedToUserId", user._id))
    .order("desc")
    .take(5);

  const hrefByKey: Record<string, string> = {};
  for (const p of pages) hrefByKey[p.href] = p.href;

  const ticketLine = (prefix: string, t: Doc<"itTickets">, index: number) => {
    const key = `${prefix}${index}`;
    hrefByKey[key] = `/it-tickets?ticket=${t._id}`;
    return `- ${key} — #${t.nr} ${t.topic?.trim() || t.category} (Status: ${t.status}, ${berlinTime(t.createdAt)})`;
  };

  const text = [
    block(
      "Bekannte Seiten (key — Beschreibung)",
      pages.map((p) => `- ${p.href} — ${p.label}`),
    ),
    block(
      "Eigene zuletzt erstellte IT-Tickets",
      myTickets.map((t, i) => ticketLine("myTicket", t, i)),
    ),
    block(
      "IT-Tickets, die dir zugewiesen sind",
      assignedTickets.map((t, i) => ticketLine("assignedTicket", t, i)),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    text,
    hrefByKey,
    sources: [
      { label: "Bekannte Seiten" },
      ...(myTickets.length || assignedTickets.length
        ? [{ label: "IT-Tickets", href: "/it-tickets" }]
        : []),
    ],
  };
}

export const apiNavigateContext = serverQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await getUserByClerkId(ctx, clerkUserId);
    if (!user || user.status === "suspended") {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    return navigateContext(ctx, user);
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
