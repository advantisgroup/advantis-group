import { sandboxedMutation as mutation } from "../lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type MutationCtx, query } from "../_generated/server";
import { getUserByClerkId } from "../lib/auth";
import { assertServerKey, requireAdminCaller } from "./lib";

/**
 * Server-key gated CRUD for Sales Coach EV call records, called exclusively
 * by the Elysia API, which authenticates the Clerk session and encrypts the
 * transcript/feedback blobs with a server-held key before writing here — see
 * apps/api/src/routes/sales-coach-ev.ts. This layer never sees plaintext
 * call content, only ciphertext plus the plain numeric scores charts need.
 */

const scoresValidator = v.object({
  zufriedenheit: v.number(),
  ev_schwenk: v.number(),
  informationen: v.number(),
  offene_fragen: v.number(),
  sprache: v.number(),
  quittung: v.number(),
  abschluss: v.number(),
  skript: v.number(),
});

/** Load a call and verify it belongs to the given user, or throw. */
async function ownedCall(ctx: MutationCtx, id: Id<"salesCoachEvCalls">, clerkUserId: string) {
  const call = await ctx.db.get(id);
  if (!call || call.clerkUserId !== clerkUserId) {
    throw new ConvexError({ code: "not_found", message: "Call not found" });
  }
  return call;
}

/** The caller's own call history, newest first, optionally bounded to a
 * start timestamp. Capped at 500 rows — a single rep's own history, not an
 * org-scale scan, but still an ever-growing table so never `.collect()`. */
export const list = query({
  args: { serverKey: v.string(), clerkUserId: v.string(), sinceMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const calls = await ctx.db
      .query("salesCoachEvCalls")
      .withIndex("by_user_time", (q) =>
        args.sinceMs !== undefined
          ? q.eq("clerkUserId", args.clerkUserId).gte("startedAt", args.sinceMs)
          : q.eq("clerkUserId", args.clerkUserId),
      )
      .order("desc")
      .take(500);
    return calls;
  },
});

export const get = query({
  args: { serverKey: v.string(), clerkUserId: v.string(), id: v.id("salesCoachEvCalls") },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const call = await ctx.db.get(args.id);
    if (!call || call.clerkUserId !== args.clerkUserId) return null;
    return call;
  },
});

export const create = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    startedAt: v.number(),
    durationSec: v.number(),
    callerSpeakPct: v.number(),
    outcome: v.union(v.literal("termin"), v.literal("wiedervorlage"), v.literal("kein_ergebnis")),
    transcriptEnc: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    // Resolved from the authoritative users table, not trusted client input.
    const user = await getUserByClerkId(ctx, args.clerkUserId);
    const userName = user
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email
      : args.clerkUserId;
    const id = await ctx.db.insert("salesCoachEvCalls", {
      clerkUserId: args.clerkUserId,
      userName,
      startedAt: args.startedAt,
      durationSec: args.durationSec,
      callerSpeakPct: args.callerSpeakPct,
      outcome: args.outcome,
      transcriptEnc: args.transcriptEnc,
      scored: false,
    });
    return { id };
  },
});

/** Attach the AI-generated scoring report to a previously-saved call. */
export const attachReport = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    id: v.id("salesCoachEvCalls"),
    scores: scoresValidator,
    skillLevel: v.number(),
    feedbackEnc: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    await ownedCall(ctx, args.id, args.clerkUserId);
    await ctx.db.patch(args.id, {
      scored: true,
      scores: args.scores,
      skillLevel: args.skillLevel,
      feedbackEnc: args.feedbackEnc,
    });
    return { updated: true };
  },
});

/**
 * Admin-only team overview: per-employee aggregates (call count, average
 * score, appointment count, trend) over a bounded window. Never returns
 * transcript/feedback ciphertext — the admin roster is aggregates only.
 * `sinceMs` is computed once by the caller (apps/api) and passed in, so the
 * index range bound here is a plain argument, never `Date.now()` evaluated
 * inside the query itself.
 */
export const adminRoster = query({
  args: { serverKey: v.string(), clerkUserId: v.string(), sinceMs: v.number() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    await requireAdminCaller(ctx, args.clerkUserId);

    const calls = await ctx.db
      .query("salesCoachEvCalls")
      .withIndex("by_startedAt", (q) => q.gte("startedAt", args.sinceMs))
      .collect();

    const byUser = new Map<
      string,
      { userName: string; calls: { startedAt: number; skillLevel?: number; outcome: string }[] }
    >();
    for (const call of calls) {
      const entry = byUser.get(call.clerkUserId) ?? { userName: call.userName, calls: [] };
      entry.userName = call.userName;
      entry.calls.push({
        startedAt: call.startedAt,
        skillLevel: call.skillLevel,
        outcome: call.outcome,
      });
      byUser.set(call.clerkUserId, entry);
    }

    return Array.from(byUser.entries()).map(([clerkUserId, entry]) => {
      const scored = entry.calls
        .filter((c) => c.skillLevel != null)
        .sort((a, b) => a.startedAt - b.startedAt);
      const avgScore = scored.length
        ? Math.round(scored.reduce((sum, c) => sum + (c.skillLevel ?? 0), 0) / scored.length)
        : 0;
      const appointments = entry.calls.filter((c) => c.outcome === "termin").length;
      const avgOf = (rows: typeof scored) =>
        rows.length
          ? Math.round(rows.reduce((sum, c) => sum + (c.skillLevel ?? 0), 0) / rows.length)
          : 0;
      const trend = scored.length > 4 ? avgOf(scored.slice(-3)) - avgOf(scored.slice(0, 3)) : 0;

      return {
        clerkUserId,
        userName: entry.userName,
        callCount: entry.calls.length,
        avgScore,
        appointments,
        trend,
      };
    });
  },
});
