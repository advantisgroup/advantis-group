import { v } from "convex/values";

import { gatedMutation, query, userQuery } from "../functions";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireSessionCaller } from "../lib/caller";
import { appError } from "../lib/errors";
import { safeEqual } from "./lib/crypto";
import { getActivitySubprofile } from "./lib/people";
import { applyStateSignal, getStateRow } from "./lib/signals";

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
  v.literal("NOT_RESPONDING"),
);
const PRESENCE = v.union(
  v.literal("AVAILABLE"),
  v.literal("BUSY"),
  v.literal("AWAY"),
  v.literal("OFFLINE"),
);
const FINAL_STATE = v.union(
  v.literal("ABSENT"),
  v.literal("CLOCKED_OUT"),
  v.literal("BREAK"),
  v.literal("IN_CALL"),
  v.literal("WRAP_UP"),
  v.literal("ACTIVE"),
  v.literal("IDLE"),
);

/** The Clockodo-derived signal fields repeated (with different provenance —
 *  live cache vs. historical samples) across `myState`/`stateBatch`'s return
 *  shapes. Named once so both stay in sync. */
const CLOCKODO_STATE_FIELDS = {
  clockodoWorking: v.union(v.boolean(), v.null()),
  clockodoBreak: v.union(v.boolean(), v.null()),
  clockodoAbsent: v.union(v.boolean(), v.null()),
  clockodoClockedOut: v.union(v.boolean(), v.null()),
  clockodoClockedOutCertain: v.union(v.boolean(), v.null()),
};

function assertSignalSecret(secret: string): void {
  const expected = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
  if (!expected || !safeEqual(secret, expected)) {
    throw appError("forbidden", "Invalid signal secret");
  }
}

/**
 * Server-to-server entry point (secret-guarded, called from the Elysia API
 * layer). The actual desktop-agent heartbeat is handled by `/ingest` (see
 * `activity/ingest.ts`), which calls `applyStateSignal` directly — the agent
 * only ever authenticates with its device token and has no way to know its
 * own `employeeId`, so this mutation's `agent` source exists for parity/
 * future callers rather than the deployed agent.
 */
export const pushSignal = gatedMutation("activitytrack")({
  args: {
    secret: v.string(),
    employeeId: v.string(),
    source: v.union(v.literal("agent"), v.literal("genesys"), v.literal("clockodo")),
    deviceIdle: v.optional(v.boolean()),
    idleSeconds: v.optional(v.number()),
    genesysRoutingStatus: v.optional(ROUTING_STATUS),
    genesysPresence: v.optional(PRESENCE),
    genesysWrapUp: v.optional(v.boolean()),
    clockodoWorking: v.optional(v.boolean()),
    clockodoBreak: v.optional(v.boolean()),
    clockodoAbsent: v.optional(v.boolean()),
    clockodoClockedOut: v.optional(v.boolean()),
    clockodoClockedOutCertain: v.optional(v.boolean()),
    clockodoClockedOutSince: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSignalSecret(args.secret);
    return await applyStateSignal(ctx, args);
  },
});

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
        .withIndex("by_genesysUserId", (q) => q.eq("genesysUserId", genesysUserId))
        .unique();
    }
    if (!person && clockodoUserId) {
      person = await ctx.db
        .query("people")
        .withIndex("by_clockodoUserId", (q) => q.eq("clockodoUserId", clockodoUserId))
        .unique();
    }
    return person?.employeeId ?? null;
  },
});

/** Report an integration source's health (server-to-server). */
export const reportHealth = gatedMutation("activitytrack")({
  args: {
    secret: v.string(),
    source: v.union(v.literal("genesys"), v.literal("clockodo")),
    status: v.union(v.literal("ok"), v.literal("unavailable"), v.literal("unconfigured")),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { secret, source, status, message }) => {
    assertSignalSecret(secret);
    const now = Date.now();
    const existing = await ctx.db
      .query("integrationHealth")
      .withIndex("by_source", (q) => q.eq("source", source))
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
export const health = userQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("integrationHealth").collect();
  },
});

/** Server-to-server: the external-id map for every active mapped person. */
export const mappings = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSignalSecret(secret);
    const people = await ctx.db.query("people").take(2000);
    return people
      .filter((p) => p.active && p.employeeId)
      .map((p) => ({
        employeeId: p.employeeId!,
        genesysUserId: p.genesysUserId ?? null,
        clockodoUserId: p.clockodoUserId ?? null,
      }));
  },
});

/**
 * Reactive dashboard read: every cached employee state joined to its person.
 * Org-wide presence data, so it requires `view_activity_admin` (Managers+, or
 * a custom role granted the capability) rather than just being signed in —
 * use `myState` for a caller's own status.
 */
export const overview = userQuery({
  can: "view_activity_admin",
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("employeeStates").take(2000);

    const people = await ctx.db.query("people").take(2000);
    const byEmployeeId = new Map(
      people.flatMap((p) => (p.employeeId ? [[p.employeeId, p] as const] : [])),
    );

    return rows.map((row) => {
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
        clockodoClockedOutCertain: row.clockodoClockedOutCertain ?? null,
        agentUpdatedAt: row.agentUpdatedAt ?? null,
        genesysUpdatedAt: row.genesysUpdatedAt ?? null,
        clockodoUpdatedAt: row.clockodoUpdatedAt ?? null,
        updatedAt: row.updatedAt,
      };
    });
  },
});

/**
 * Requires `view_activity_admin` unless the caller is asking about their own
 * `employeeId` — every by-employeeId read below is either an admin looking at
 * someone else's presence/history, or a person looking at their own, and
 * nothing in between is legitimate.
 */
async function requireSelfOrActivityAdmin(ctx: QueryCtx, employeeId: string): Promise<void> {
  const caller = await requireSessionCaller(ctx);
  const subprofile = await getActivitySubprofile(ctx, caller.id);
  if (subprofile.employeeId === employeeId) return;
  if (caller.can("view_activity_admin")) return;
  throw appError("forbidden", "You do not have permission to view this employee's data");
}

/** Reactive single-employee read (timeline / detail panes). */
export const get = query({
  args: { employeeId: v.string() },
  handler: async (ctx, { employeeId }) => {
    await requireSelfOrActivityAdmin(ctx, employeeId);
    return await getStateRow(ctx, employeeId);
  },
});

/**
 * The caller's own fused status — the overview's "your day" widget. This is
 * self-data, not team surveillance, so it stays open to any signed-in user
 * regardless of `view_activity_admin`. Returns `null` for callers with no
 * `people` roster row (not everyone is on the ActivityTrack roster).
 */
export const myState = userQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      finalState: FINAL_STATE,
      finalStateSince: v.union(v.number(), v.null()),
      ...CLOCKODO_STATE_FIELDS,
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const subprofile = await getActivitySubprofile(ctx, user._id);
    if (!subprofile.employeeId) return null;
    const state = await getStateRow(ctx, subprofile.employeeId);
    if (!state) return null;
    return {
      finalState: state.finalState,
      finalStateSince: state.finalStateSince ?? null,
      clockodoWorking: state.clockodoWorking ?? null,
      clockodoBreak: state.clockodoBreak ?? null,
      clockodoAbsent: state.clockodoAbsent ?? null,
      clockodoClockedOut: state.clockodoClockedOut ?? null,
      clockodoClockedOutCertain: state.clockodoClockedOutCertain ?? null,
      updatedAt: state.updatedAt,
    };
  },
});

export const stateBatch = userQuery({
  args: {
    employeeIds: v.optional(v.array(v.string())),
    since: v.number(),
  },
  returns: v.array(
    v.object({
      employeeId: v.string(),
      state: v.union(
        v.null(),
        v.object({
          finalState: FINAL_STATE,
          finalStateSince: v.number(),
          ...CLOCKODO_STATE_FIELDS,
          updatedAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { employeeIds = [], since }) => {
    const user = ctx.caller.user;

    const subprofile = await getActivitySubprofile(ctx, user._id);
    // Requesting anyone else's employeeId requires view_activity_admin; a
    // caller without it only ever gets their own state back, same as if
    // they'd asked for nothing at all (see requireSelfOrActivityAdmin above).
    const canViewOthers = ctx.caller.can("view_activity_admin");
    const requested = canViewOthers ? employeeIds : [];

    const ids = [
      ...new Set([...requested, ...(subprofile.employeeId ? [subprofile.employeeId] : [])]),
    ].slice(0, 100);

    return await Promise.all(
      ids.map(async (employeeId) => {
        const samples = await ctx.db
          .query("stateSamples")
          .withIndex("by_employee_time", (q) => q.eq("employeeId", employeeId).gte("at", since))
          .order("asc")
          .take(500);

        if (samples.length === 0) {
          return {
            employeeId,
            state: null,
          };
        }

        const latest = samples[samples.length - 1];

        // Find when this state started today
        let finalStateSince = latest.at;

        for (let i = samples.length - 1; i >= 0; i--) {
          if (samples[i].state !== latest.state) {
            break;
          }

          finalStateSince = samples[i].at;
        }

        return {
          employeeId,
          state: {
            finalState: latest.state,
            finalStateSince,
            clockodoWorking: null,
            clockodoBreak: null,
            clockodoAbsent: null,
            clockodoClockedOut: null,
            clockodoClockedOutCertain: null,
            updatedAt: latest.at,
          },
        };
      }),
    );
  },
});

/**
 * A plain "in office" boolean per user — device actively used (not idle)
 * AND currently clocked in via Clockodo — for Directory's presence badge.
 * Deliberately narrower than `teamOverview` (idle seconds, hostname,
 * Genesys detail, gated on `view_activity_admin`): this exposes only the
 * derived boolean to any signed-in user, since that's materially less
 * sensitive than the admin payload it's drawn from, matching the audience
 * Directory itself already has. Returns `null` (not `false`) for anyone
 * without an ActivityTrack roster/device-state row at all — not everyone
 * is on the roster, and the caller should fall back to a different signal
 * rather than showing a false "not in office".
 */
export const inOfficeForUsers = userQuery({
  args: { userIds: v.array(v.id("users")) },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      inOffice: v.union(v.boolean(), v.null()),
    }),
  ),
  handler: async (ctx, { userIds }) => {
    const ids = userIds.slice(0, 500);
    return await Promise.all(
      ids.map(async (userId) => {
        const subprofile = await getActivitySubprofile(ctx, userId);
        if (!subprofile.employeeId) return { userId, inOffice: null };
        const state = await getStateRow(ctx, subprofile.employeeId);
        if (!state || state.deviceIdle === undefined || state.clockodoWorking === undefined) {
          return { userId, inOffice: null };
        }
        return { userId, inOffice: state.deviceIdle === false && state.clockodoWorking === true };
      }),
    );
  },
});

/**
 * Pure-Clockodo clock status for the admin roster table — reads the
 * cached `employeeStates` fields directly rather than the fused
 * `finalState` (which also factors in Genesys/desktop activity), since
 * this is specifically "what does Clockodo say", not the full
 * ActivityTrack presence picture. Only covers Clockodo users who also
 * happen to be in the `people` roster (ActivityTrack-tracked); anyone
 * else resolves to `null` so the table can show a plain "—" instead of a
 * wrong guess. Takes raw numeric Clockodo ids (`people.clockodoUserId` is
 * stored as a string — converted internally) so the admin panel doesn't
 * need its own copy of that conversion.
 */
export const clockodoStatusForRoster = userQuery({
  can: "view_clockodo_team",
  args: { clockodoUserIds: v.array(v.number()) },
  returns: v.array(
    v.object({
      clockodoUserId: v.number(),
      status: v.union(v.literal("working"), v.literal("break"), v.literal("clockedOut"), v.null()),
    }),
  ),
  handler: async (ctx, { clockodoUserIds }) => {
    const ids = clockodoUserIds.slice(0, 500);
    return await Promise.all(
      ids.map(async (clockodoUserId) => {
        const person = await ctx.db
          .query("people")
          .withIndex("by_clockodoUserId", (q) => q.eq("clockodoUserId", String(clockodoUserId)))
          .unique();
        if (!person?.employeeId) return { clockodoUserId, status: null };
        const state = await getStateRow(ctx, person.employeeId);
        if (!state || state.clockodoWorking === undefined) {
          return { clockodoUserId, status: null };
        }
        if (state.clockodoWorking) return { clockodoUserId, status: "working" as const };
        if (state.clockodoBreak) return { clockodoUserId, status: "break" as const };
        return { clockodoUserId, status: "clockedOut" as const };
      }),
    );
  },
});

/**
 * Batched state history for the overview's per-card day strips: today's state
 * changes for many employees in one reactive query, so the overview grid does
 * not open one subscription per card. No prior-day row is prepended — the
 * strips are today-only and must not extend yesterday's state from midnight.
 */
export const historyBatch = userQuery({
  args: { employeeIds: v.optional(v.array(v.string())), since: v.number() },
  returns: v.array(
    v.object({
      employeeId: v.string(),
      samples: v.array(v.object({ state: FINAL_STATE, at: v.number() })),
    }),
  ),
  handler: async (ctx, { employeeIds, since }) => {
    const user = ctx.caller.user;
    const subprofile = await getActivitySubprofile(ctx, user._id);
    // Same rule as stateBatch: only an admin-capable caller can pull other
    // employees' history, e.g. the overview grid's per-card strips.
    const canViewOthers = ctx.caller.can("view_activity_admin");
    const requested = canViewOthers ? (employeeIds ?? []) : [];

    const ids = [
      ...new Set(requested),
      ...(subprofile.employeeId ? [subprofile.employeeId] : []),
    ].slice(0, 100);

    return await Promise.all(
      ids.map(async (employeeId) => {
        const rows = await ctx.db
          .query("stateSamples")
          .withIndex("by_employee_time", (q) => q.eq("employeeId", employeeId).gte("at", since))
          .order("asc")
          .take(500);
        return {
          employeeId,
          samples: rows.map((r) => ({ state: r.state, at: r.at })),
        };
      }),
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
    await requireSelfOrActivityAdmin(ctx, employeeId);
    const rows = await ctx.db
      .query("stateSamples")
      .withIndex("by_employee_time", (q) =>
        until !== undefined
          ? q.eq("employeeId", employeeId).gte("at", since).lte("at", until)
          : q.eq("employeeId", employeeId).gte("at", since),
      )
      .order("asc")
      .take(Math.min(limit ?? 5000, 10000));

    const prior = await ctx.db
      .query("stateSamples")
      .withIndex("by_employee_time", (q) => q.eq("employeeId", employeeId).lt("at", since))
      .order("desc")
      .first();

    return prior ? [prior, ...rows] : rows;
  },
});

/**
 * Quarantined (rejected) state transitions for one employee in
 * `[since, until]` — what the "Discarded" tab shows. These rows never entered
 * the timeline; they exist purely so out-of-hours signals stay auditable
 * instead of silently vanishing (or, worse, corrupting the day).
 */
export const discardedHistory = query({
  args: {
    employeeId: v.string(),
    since: v.number(),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { employeeId, since, until, limit }) => {
    await requireSelfOrActivityAdmin(ctx, employeeId);
    const rows = await ctx.db
      .query("discardedStateSamples")
      .withIndex("by_employee_time", (q) =>
        until !== undefined
          ? q.eq("employeeId", employeeId).gte("at", since).lte("at", until)
          : q.eq("employeeId", employeeId).gte("at", since),
      )
      .order("asc")
      .take(Math.min(limit ?? 1000, 5000));
    return rows.map((r) => ({
      state: r.state,
      at: r.at,
      reason: r.reason,
      source: r.source ?? null,
    }));
  },
});

/**
 * Org-wide feed of recently quarantined signals, newest first, joined to
 * person names — the Settings → "Discarded data" view. Seeing *everyone's*
 * rejected signals in one list is what makes systemic patterns visible (e.g.
 * "every PC 'woke up' at 02:00" = an integration bug, not people working).
 */
export const discardedRecent = userQuery({
  can: "view_activity_admin",
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("discardedStateSamples")
      .withIndex("by_at")
      .order("desc")
      .take(Math.min(limit ?? 200, 1000));

    const people = await ctx.db.query("people").take(2000);
    const nameByEmployeeId = new Map(
      people.flatMap((p) => (p.employeeId ? [[p.employeeId, p.name] as const] : [])),
    );

    return rows.map((r) => ({
      employeeId: r.employeeId,
      personName: nameByEmployeeId.get(r.employeeId) ?? null,
      state: r.state,
      at: r.at,
      reason: r.reason,
      source: r.source ?? null,
    }));
  },
});
