import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { readConfig } from "./settings";
import {
  isWithinBusinessHours,
  WORK_EVIDENCE_STATES,
} from "./lib/businessHours";

/**
 * Retention: prune raw `activitySamples` and `stateSamples` older than N days.
 * Daily rollups in `dailyStats` persist. Deletes in bounded batches; the cron
 * re-runs daily until caught up.
 */
const BATCH = 4_000;

export const pruneOldSamples = internalMutation({
  args: { retentionDays: v.optional(v.number()) },
  handler: async (ctx, { retentionDays }) => {
    const days = retentionDays ?? (await readConfig(ctx)).retentionDays;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const stale = await ctx.db
      .query("activitySamples")
      .withIndex("by_receivedAt", q => q.lt("receivedAt", cutoff))
      .take(BATCH);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length };
  },
});

/** Retention: drop fused-state history older than the configured window
 * (including quarantined out-of-hours rows). */
export const pruneOldStateSamples = internalMutation({
  args: { retentionDays: v.optional(v.number()) },
  handler: async (ctx, { retentionDays }) => {
    const days = retentionDays ?? (await readConfig(ctx)).retentionDays;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const stale = await ctx.db
      .query("stateSamples")
      .withIndex("by_at", q => q.lt("at", cutoff))
      .take(BATCH);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    const staleDiscarded = await ctx.db
      .query("discardedStateSamples")
      .withIndex("by_at", q => q.lt("at", cutoff))
      .take(BATCH);
    for (const row of staleDiscarded) {
      await ctx.db.delete(row._id);
    }

    return { deleted: stale.length + staleDiscarded.length };
  },
});

/**
 * One-shot repair for history written before the out-of-hours quarantine
 * existed: moves already-recorded "working" samples (ACTIVE, IDLE, IN_CALL,
 * WRAP_UP, BREAK) whose timestamp falls outside business hours from
 * `stateSamples` into `discardedStateSamples`, so past days stop showing the
 * bogus 2 AM activity. Bounded batch; run repeatedly (advancing `since` to the
 * returned `cursorAt`) until `done` is true:
 *
 *   npx convex run activity/maintenance:quarantineOutOfHoursStateSamples \
 *     '{"since": <epoch ms>}'
 */
export const quarantineOutOfHoursStateSamples = internalMutation({
  args: { since: v.number(), until: v.optional(v.number()) },
  handler: async (ctx, { since, until }) => {
    const rows = await ctx.db
      .query("stateSamples")
      .withIndex("by_at", q =>
        until !== undefined
          ? q.gte("at", since).lt("at", until)
          : q.gte("at", since)
      )
      .order("asc")
      .take(BATCH);

    let quarantined = 0;
    for (const row of rows) {
      if (!WORK_EVIDENCE_STATES.has(row.state)) continue;
      if (isWithinBusinessHours(row.at)) continue;
      await ctx.db.insert("discardedStateSamples", {
        employeeId: row.employeeId,
        state: row.state,
        at: row.at,
        reason: "outside_business_hours",
      });
      await ctx.db.delete(row._id);
      quarantined++;
    }

    const last = rows[rows.length - 1];
    return {
      scanned: rows.length,
      quarantined,
      cursorAt: last ? last.at + 1 : null,
      done: rows.length < BATCH,
    };
  },
});
