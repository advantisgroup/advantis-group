import { v } from "convex/values";

import { internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { requireAdmin } from "../lib/auth";
import { gatedInternalMutation } from "../lib/featureGate";
import { writeAudit } from "./audit";
import { readConfig } from "./settings";
import {
  isWithinBusinessHours,
  WORK_EVIDENCE_STATES,
} from "./lib/businessHours";
import type { EmployeeState } from "./lib/state";

/**
 * Retention: prune raw `activitySamples` and `stateSamples` older than N days.
 * Daily rollups in `dailyStats` persist. Deletes in bounded batches; the cron
 * re-runs daily until caught up.
 */
const BATCH = 4_000;
/**
 * Smaller batch for the Settings → Troubleshooting buttons: their batches can
 * pair a delete with an insert per row, and the browser loops until done
 * anyway, so staying well inside Convex's per-mutation write limit matters
 * more than per-call throughput.
 */
const TROUBLESHOOT_BATCH = 2_000;

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

/** One bounded pruning pass over the state-history tables. */
async function pruneStateSamplesBatch(
  ctx: MutationCtx,
  cutoff: number,
  batch: number
): Promise<{ deleted: number; done: boolean }> {
  const stale = await ctx.db
    .query("stateSamples")
    .withIndex("by_at", q => q.lt("at", cutoff))
    .take(batch);
  for (const row of stale) {
    await ctx.db.delete(row._id);
  }

  const staleDiscarded = await ctx.db
    .query("discardedStateSamples")
    .withIndex("by_at", q => q.lt("at", cutoff))
    .take(batch);
  for (const row of staleDiscarded) {
    await ctx.db.delete(row._id);
  }

  return {
    deleted: stale.length + staleDiscarded.length,
    done: stale.length < batch && staleDiscarded.length < batch,
  };
}

/** Retention: drop fused-state history older than the configured window
 * (including quarantined out-of-hours rows). */
export const pruneOldStateSamples = internalMutation({
  args: { retentionDays: v.optional(v.number()) },
  handler: async (ctx, { retentionDays }) => {
    const days = retentionDays ?? (await readConfig(ctx)).retentionDays;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const { deleted } = await pruneStateSamplesBatch(ctx, cutoff, BATCH);
    return { deleted };
  },
});

/**
 * One bounded pass of the out-of-hours history repair: moves already-recorded
 * "working" samples (ACTIVE, IDLE, IN_CALL, WRAP_UP, BREAK) whose timestamp
 * falls outside business hours from `stateSamples` into
 * `discardedStateSamples`, so past days stop showing the bogus 2 AM activity.
 * Scans `[since, until)` in `at` order; the caller advances `since` to the
 * returned `cursorAt` until `done`.
 */
async function quarantineOutOfHoursBatch(
  ctx: MutationCtx,
  since: number,
  until: number | undefined,
  batch: number
): Promise<{
  scanned: number;
  quarantined: number;
  cursorAt: number | null;
  done: boolean;
}> {
  const rows = await ctx.db
    .query("stateSamples")
    .withIndex("by_at", q =>
      until !== undefined
        ? q.gte("at", since).lt("at", until)
        : q.gte("at", since)
    )
    .order("asc")
    .take(batch);

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
    done: rows.length < batch,
  };
}

/**
 * CLI escape hatch for the out-of-hours repair (same batch semantics as the
 * Settings → Troubleshooting button):
 *
 *   npx convex run activity/maintenance:quarantineOutOfHoursStateSamples \
 *     '{"since": <epoch ms>}'
 */
export const quarantineOutOfHoursStateSamples = internalMutation({
  args: { since: v.number(), until: v.optional(v.number()) },
  handler: async (ctx, { since, until }) => {
    return await quarantineOutOfHoursBatch(ctx, since, until, BATCH);
  },
});

// --- Troubleshooting (Settings → Configuration) ----------------------------
//
// Browser-callable repairs, so fixes don't require CLI access (e.g. from a
// phone). Admin-gated, batched, and audited once per run — the UI calls the
// mutation in a loop, passing the returned cursor back in, until `done`.

/**
 * Apply the business-hours rule to history recorded *before* the quarantine
 * existed: each call processes one batch. Start with no `cursor` (audits the
 * run and begins at 0), then keep calling with the returned `cursorAt`.
 */
export const troubleshootQuarantineOutOfHours = mutation({
  args: { cursor: v.optional(v.number()) },
  handler: async (ctx, { cursor }) => {
    const me = await requireAdmin(ctx);
    if (cursor === undefined) {
      await writeAudit(
        ctx,
        me._id,
        "maintenance.quarantineOutOfHours",
        "moved out-of-hours state history to discarded data"
      );
    }
    return await quarantineOutOfHoursBatch(
      ctx,
      cursor ?? 0,
      undefined,
      TROUBLESHOOT_BATCH
    );
  },
});

/**
 * Run the nightly retention pruning on demand: each call deletes one batch of
 * rows older than the retention window (raw samples + state history +
 * discarded rows). Pass `continuation: true` on follow-up calls so only the
 * first one lands in the audit log.
 */
export const troubleshootPruneNow = mutation({
  args: { continuation: v.optional(v.boolean()) },
  handler: async (ctx, { continuation }) => {
    const me = await requireAdmin(ctx);
    if (!continuation) {
      await writeAudit(
        ctx,
        me._id,
        "maintenance.pruneNow",
        "retention pruning"
      );
    }
    const cutoff =
      Date.now() - (await readConfig(ctx)).retentionDays * 24 * 60 * 60 * 1000;

    const raw = await ctx.db
      .query("activitySamples")
      .withIndex("by_receivedAt", q => q.lt("receivedAt", cutoff))
      .take(TROUBLESHOOT_BATCH);
    for (const row of raw) {
      await ctx.db.delete(row._id);
    }

    const state = await pruneStateSamplesBatch(ctx, cutoff, TROUBLESHOOT_BATCH);

    return {
      deleted: raw.length + state.deleted,
      done: raw.length < TROUBLESHOOT_BATCH && state.done,
    };
  },
});

/** States Clockodo's own signal directly asserts (see `computeEmployeeState`).
 * A "Deep sanitize" pass only ever rewrites samples in this set — it never
 * touches IN_CALL/WRAP_UP/ACTIVE/IDLE, which come from Genesys/the desktop
 * agent and can't be re-derived from Clockodo entries alone. */
const CLOCKODO_OWNED_STATES: ReadonlySet<EmployeeState> = new Set([
  "ABSENT",
  "CLOCKED_OUT",
  "BREAK",
]);

/**
 * Per-employee half of "Deep sanitize (Clockodo)" (see
 * `clockodo.troubleshootSanitizeDay`, which owns the HTTP fetch and calls this
 * once per mapped person). Rebuilds one day's Clockodo-owned history from a
 * deep entries fetch:
 *
 *   1. Delete every existing ABSENT/CLOCKED_OUT/BREAK sample in the window —
 *      these are exactly what a fresh Clockodo read can re-derive; anything
 *      else (IN_CALL/WRAP_UP/ACTIVE/IDLE) is left alone as more-specific
 *      evidence from another source.
 *   2. Re-insert a sample per Clockodo-owned segment (ABSENT/CLOCKED_OUT/
 *      BREAK), subject to the same out-of-hours quarantine `pushSignal` uses.
 *   3. For a "WORKING" segment (Clockodo has no opinion beyond "not blocked"),
 *      only assert the ACTIVE fallback if no non-Clockodo sample already
 *      covers that instant — otherwise that more specific evidence stands.
 */
export const reconcileClockodoDayForEmployee = gatedInternalMutation(
  "activitytrack"
)({
  args: {
    employeeId: v.string(),
    dayStartMs: v.number(),
    capMs: v.number(),
    segments: v.array(
      v.object({
        at: v.number(),
        kind: v.union(
          v.literal("ABSENT"),
          v.literal("CLOCKED_OUT"),
          v.literal("BREAK"),
          v.literal("WORKING")
        ),
      })
    ),
  },
  handler: async (ctx, { employeeId, dayStartMs, capMs, segments }) => {
    const existing = await ctx.db
      .query("stateSamples")
      .withIndex("by_employee_time", q =>
        q.eq("employeeId", employeeId).gte("at", dayStartMs).lt("at", capMs)
      )
      .order("asc")
      .collect();

    let deleted = 0;
    const keptTimes: number[] = [];
    for (const row of existing) {
      if (CLOCKODO_OWNED_STATES.has(row.state)) {
        await ctx.db.delete(row._id);
        deleted++;
      } else {
        keptTimes.push(row.at);
      }
    }

    const prior = await ctx.db
      .query("stateSamples")
      .withIndex("by_employee_time", q =>
        q.eq("employeeId", employeeId).lt("at", dayStartMs)
      )
      .order("desc")
      .first();
    const priorIsNonClockodo =
      !!prior && !CLOCKODO_OWNED_STATES.has(prior.state);

    function hasNonClockodoEvidenceAt(t: number): boolean {
      return keptTimes.some(k => k <= t) || priorIsNonClockodo;
    }

    let inserted = 0;
    let quarantined = 0;
    for (const seg of segments) {
      const state: EmployeeState = seg.kind === "WORKING" ? "ACTIVE" : seg.kind;
      if (seg.kind === "WORKING" && hasNonClockodoEvidenceAt(seg.at)) continue;

      if (
        (state === "BREAK" || state === "ACTIVE") &&
        !isWithinBusinessHours(seg.at)
      ) {
        await ctx.db.insert("discardedStateSamples", {
          employeeId,
          state,
          at: seg.at,
          reason: "outside_business_hours",
          source: "clockodo",
        });
        quarantined++;
        continue;
      }

      await ctx.db.insert("stateSamples", { employeeId, state, at: seg.at });
      inserted++;
    }

    return { inserted, deleted, quarantined };
  },
});
