import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireUser } from "../lib/auth";
import { computeEmployeeState, type StateSignals } from "./lib/state";
import { appError } from "./lib/errors";
import { safeEqual } from "./lib/crypto";

/**
 * The fused employee-state engine — the single source of truth combining the
 * desktop agent, Genesys, and Clockodo into one normalized state.
 *
 * The three signal sources live *outside* Convex and reach us through the
 * Elysia API layer, which calls `pushSignal` server-to-server. `pushSignal` is
 * therefore a public mutation guarded by a shared secret
 * (`ACTIVITYTRACK_SIGNAL_SECRET`) instead of a Clerk session. Dashboard reads go
 * through `overview`/`get`, which are Clerk + RBAC gated and reactive.
 */

const ROUTING_STATUS = v.union(
  v.literal("IDLE"),
  v.literal("INTERACTING"),
  v.literal("OFF_QUEUE"),
  v.literal("NOT_RESPONDING")
);
const PRESENCE = v.union(
  v.literal("AVAILABLE"),
  v.literal("BUSY"),
  v.literal("AWAY"),
  v.literal("OFFLINE")
);

function signalsOf(row: Partial<Doc<"employeeStates">>): StateSignals {
  return {
    deviceIdle: row.deviceIdle,
    idleSeconds: row.idleSeconds,
    genesysRoutingStatus: row.genesysRoutingStatus,
    genesysPresence: row.genesysPresence,
    genesysWrapUp: row.genesysWrapUp,
    clockodoWorking: row.clockodoWorking,
    clockodoBreak: row.clockodoBreak,
    clockodoAbsent: row.clockodoAbsent,
    clockodoClockedOut: row.clockodoClockedOut,
  };
}

/**
 * Withdraw the "assumed clocked out" interpretation for today: the person is
 * clocked in again (or a retro-added entry closed the gap), so every same-day
 * CLOCKED_OUT stretch was actually a break. Samples are patched in place — or
 * deleted when the preceding sample is already BREAK, so the break reads as
 * one uninterrupted stretch. Day boundary is UTC, matching the Clockodo
 * poller's "today's entries" window; yesterday's assumption is left alone
 * (ending the day and coming back tomorrow really was a clock-out).
 */
async function reclassifyClockedOutAsBreak(
  ctx: MutationCtx,
  employeeId: string
): Promise<void> {
  const dayStart = new Date().setUTCHours(0, 0, 0, 0);
  const samples = await ctx.db
    .query("stateSamples")
    .withIndex("by_employee_time", q =>
      q.eq("employeeId", employeeId).gte("at", dayStart)
    )
    .order("asc")
    .take(1000);

  let prevState: string | null = null;
  for (const s of samples) {
    if (s.state === "CLOCKED_OUT") {
      if (prevState === "BREAK") {
        await ctx.db.delete(s._id); // merge into the preceding break
        continue;
      }
      await ctx.db.patch(s._id, { state: "BREAK" });
      prevState = "BREAK";
      continue;
    }
    prevState = s.state;
  }
}

function assertSignalSecret(secret: string): void {
  const expected = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
  if (!expected || !safeEqual(secret, expected)) {
    throw appError("auth.forbidden", "Invalid signal secret");
  }
}

/**
 * Apply one source's slice of signals to the cache and recompute `finalState`.
 * Only the fields a source actually provides are patched.
 */
export const pushSignal = mutation({
  args: {
    secret: v.string(),
    employeeId: v.string(),
    source: v.union(
      v.literal("agent"),
      v.literal("genesys"),
      v.literal("clockodo")
    ),
    deviceIdle: v.optional(v.boolean()),
    idleSeconds: v.optional(v.number()),
    genesysRoutingStatus: v.optional(ROUTING_STATUS),
    genesysPresence: v.optional(PRESENCE),
    genesysWrapUp: v.optional(v.boolean()),
    clockodoWorking: v.optional(v.boolean()),
    clockodoBreak: v.optional(v.boolean()),
    clockodoAbsent: v.optional(v.boolean()),
    clockodoClockedOut: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertSignalSecret(args.secret);
    const now = Date.now();

    const existing = await getStateRow(ctx, args.employeeId);

    const patch: Partial<Doc<"employeeStates">> = {};
    if (args.source === "agent") {
      if (args.deviceIdle !== undefined) patch.deviceIdle = args.deviceIdle;
      if (args.idleSeconds !== undefined) patch.idleSeconds = args.idleSeconds;
      patch.agentUpdatedAt = now;
    } else if (args.source === "genesys") {
      if (args.genesysRoutingStatus !== undefined)
        patch.genesysRoutingStatus = args.genesysRoutingStatus;
      if (args.genesysPresence !== undefined)
        patch.genesysPresence = args.genesysPresence;
      if (args.genesysWrapUp !== undefined)
        patch.genesysWrapUp = args.genesysWrapUp;
      patch.genesysUpdatedAt = now;
    } else {
      if (args.clockodoWorking !== undefined)
        patch.clockodoWorking = args.clockodoWorking;
      if (args.clockodoBreak !== undefined)
        patch.clockodoBreak = args.clockodoBreak;
      if (args.clockodoAbsent !== undefined)
        patch.clockodoAbsent = args.clockodoAbsent;
      if (args.clockodoClockedOut !== undefined)
        patch.clockodoClockedOut = args.clockodoClockedOut;
      patch.clockodoUpdatedAt = now;
    }

    // A Clockodo signal that ends an "assumed clocked out" stretch (they
    // clocked back in, or a retro-added entry closed the gap) withdraws the
    // assumption: today's CLOCKED_OUT history is corrected to BREAK before the
    // new state lands.
    if (
      args.source === "clockodo" &&
      args.clockodoClockedOut === false &&
      (existing?.clockodoClockedOut === true ||
        existing?.finalState === "CLOCKED_OUT")
    ) {
      await reclassifyClockedOutAsBreak(ctx, args.employeeId);
    }

    const merged = { ...(existing ?? {}), ...patch };
    const finalState = computeEmployeeState(signalsOf(merged));
    const stateChanged = !existing || existing.finalState !== finalState;
    // Track when the fused state last *changed*, so the dashboard can say
    // "inactive since 13:42" instead of only "updated 2m ago".
    let finalStateSince = stateChanged
      ? now
      : (existing.finalStateSince ?? existing.updatedAt);

    if (stateChanged) {
      // Entering the assumed CLOCKED_OUT is a *reinterpretation* of the
      // not-clocked-in gap that started at the BREAK transition (the actual
      // clock-out) — so backdate: rewrite the trailing BREAK sample in place
      // and keep "since" at the real clock-out moment, instead of pretending
      // something new happened when the 1h threshold passed.
      const trailing =
        finalState === "CLOCKED_OUT"
          ? await ctx.db
              .query("stateSamples")
              .withIndex("by_employee_time", q =>
                q.eq("employeeId", args.employeeId)
              )
              .order("desc")
              .first()
          : null;
      if (finalState === "CLOCKED_OUT" && trailing?.state === "BREAK") {
        await ctx.db.patch(trailing._id, { state: "CLOCKED_OUT" });
        finalStateSince = existing?.finalStateSince ?? trailing.at;
      } else {
        await ctx.db.insert("stateSamples", {
          employeeId: args.employeeId,
          state: finalState,
          at: now,
        });
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        finalState,
        finalStateSince,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("employeeStates", {
        employeeId: args.employeeId,
        ...patch,
        finalState,
        finalStateSince,
        updatedAt: now,
      });
    }

    return { employeeId: args.employeeId, finalState };
  },
});

async function getStateRow(
  ctx: MutationCtx | QueryCtx,
  employeeId: string
): Promise<Doc<"employeeStates"> | null> {
  return await ctx.db
    .query("employeeStates")
    .withIndex("by_employeeId", q => q.eq("employeeId", employeeId))
    .unique();
}

/** Resolve a source-native user id to the canonical `employeeId`. */
export const resolveEmployeeId = query({
  args: {
    secret: v.string(),
    genesysUserId: v.optional(v.string()),
    clockodoUserId: v.optional(v.string()),
  },
  handler: async (ctx, { secret, genesysUserId, clockodoUserId }) => {
    assertSignalSecret(secret);
    let person: Doc<"people"> | null = null;
    if (genesysUserId) {
      person = await ctx.db
        .query("people")
        .withIndex("by_genesysUserId", q =>
          q.eq("genesysUserId", genesysUserId)
        )
        .unique();
    }
    if (!person && clockodoUserId) {
      person = await ctx.db
        .query("people")
        .withIndex("by_clockodoUserId", q =>
          q.eq("clockodoUserId", clockodoUserId)
        )
        .unique();
    }
    return person?.employeeId ?? null;
  },
});

/** Report an integration source's health (server-to-server). */
export const reportHealth = mutation({
  args: {
    secret: v.string(),
    source: v.union(v.literal("genesys"), v.literal("clockodo")),
    status: v.union(
      v.literal("ok"),
      v.literal("unavailable"),
      v.literal("unconfigured")
    ),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { secret, source, status, message }) => {
    assertSignalSecret(secret);
    const now = Date.now();
    const existing = await ctx.db
      .query("integrationHealth")
      .withIndex("by_source", q => q.eq("source", source))
      .unique();
    const patch = {
      source,
      status,
      message,
      updatedAt: now,
      ...(status === "ok" ? { lastOkAt: now } : { lastErrorAt: now }),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("integrationHealth", patch);
    }
  },
});

/** Reactive read of every integration's health, for the dashboard banner. */
export const health = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    return await ctx.db.query("integrationHealth").collect();
  },
});

/** Server-to-server: the external-id map for every active mapped person. */
export const mappings = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSignalSecret(secret);
    const people = await ctx.db.query("people").collect();
    return people
      .filter(p => p.active && p.employeeId)
      .map(p => ({
        employeeId: p.employeeId!,
        genesysUserId: p.genesysUserId ?? null,
        clockodoUserId: p.clockodoUserId ?? null,
      }));
  },
});

/** Reactive dashboard read: every cached employee state joined to its person. */
export const overview = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);

    const rows = await ctx.db.query("employeeStates").take(2000);

    const people = await ctx.db.query("people").take(2000);
    const byEmployeeId = new Map(
      people.flatMap(p => (p.employeeId ? [[p.employeeId, p] as const] : []))
    );

    return rows.map(row => {
      const person = byEmployeeId.get(row.employeeId) ?? null;
      return {
        employeeId: row.employeeId,
        personId: person?._id ?? null,
        personName: person?.name ?? null,
        finalState: row.finalState,
        finalStateSince: row.finalStateSince ?? null,
        deviceIdle: row.deviceIdle ?? null,
        idleSeconds: row.idleSeconds ?? null,
        genesysRoutingStatus: row.genesysRoutingStatus ?? null,
        genesysPresence: row.genesysPresence ?? null,
        genesysWrapUp: row.genesysWrapUp ?? null,
        clockodoWorking: row.clockodoWorking ?? null,
        clockodoBreak: row.clockodoBreak ?? null,
        clockodoAbsent: row.clockodoAbsent ?? null,
        clockodoClockedOut: row.clockodoClockedOut ?? null,
        agentUpdatedAt: row.agentUpdatedAt ?? null,
        genesysUpdatedAt: row.genesysUpdatedAt ?? null,
        clockodoUpdatedAt: row.clockodoUpdatedAt ?? null,
        updatedAt: row.updatedAt,
      };
    });
  },
});

/** Reactive single-employee read (timeline / detail panes). */
export const get = query({
  args: { employeeId: v.string() },
  handler: async (ctx, { employeeId }) => {
    await requireUser(ctx);
    return await getStateRow(ctx, employeeId);
  },
});

/**
 * Batched state history for the overview's per-card day strips: today's state
 * changes for many employees in one reactive query, so the overview grid does
 * not open one subscription per card. No prior-day row is prepended — the
 * strips are today-only and must not extend yesterday's state from midnight.
 */
export const historyBatch = query({
  args: { employeeIds: v.array(v.string()), since: v.number() },
  handler: async (ctx, { employeeIds, since }) => {
    await requireUser(ctx);
    const ids = [...new Set(employeeIds)].slice(0, 100);
    return await Promise.all(
      ids.map(async employeeId => {
        const rows = await ctx.db
          .query("stateSamples")
          .withIndex("by_employee_time", q =>
            q.eq("employeeId", employeeId).gte("at", since)
          )
          .order("asc")
          .take(500);
        return {
          employeeId,
          samples: rows.map(r => ({ state: r.state, at: r.at })),
        };
      })
    );
  },
});

/** State-change history for one employee in `[since, until]` (epoch ms). */
export const history = query({
  args: {
    employeeId: v.string(),
    since: v.number(),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { employeeId, since, until, limit }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("stateSamples")
      .withIndex("by_employee_time", q =>
        until !== undefined
          ? q.eq("employeeId", employeeId).gte("at", since).lte("at", until)
          : q.eq("employeeId", employeeId).gte("at", since)
      )
      .order("asc")
      .take(Math.min(limit ?? 5000, 10000));

    const prior = await ctx.db
      .query("stateSamples")
      .withIndex("by_employee_time", q =>
        q.eq("employeeId", employeeId).lt("at", since)
      )
      .order("desc")
      .first();

    return prior ? [prior, ...rows] : rows;
  },
});
