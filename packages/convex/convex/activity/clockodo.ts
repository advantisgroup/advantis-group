"use node";

import { gatedAction, userAction } from "../functions";

import { v } from "convex/values";

import { api, internal } from "../_generated/api";
import {
  signalSecret,
  reportHealth,
  healthStatusOf,
  errMessage,
  today,
} from "./lib/integrationsShared";
import {
  BUSINESS_DAY_END_HOUR,
  businessHourOf,
  startOfBusinessDayUtcMs,
} from "./lib/businessHours";
import { deriveClockodoDaySegments } from "./lib/clockodoDay";
import {
  ASSUMED_CLOCKED_OUT_AFTER_MS,
  CLOCKODO_BASE,
  type ClockodoEntry,
  clockodoHeaders,
  fetchAbsences,
  fetchClockodoWork,
  fetchEntriesForDay,
  isAbsentOn,
} from "./lib/clockodo";

async function fetchClockodoEntry(
  id: string,
): Promise<{ usersId: string | null; running: boolean | null }> {
  const res = await fetch(`${CLOCKODO_BASE()}/api/v2/entries/${id}`, {
    headers: clockodoHeaders(),
  });
  if (res.status === 404) return { usersId: null, running: null };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clockodo GET entry ${id} failed: ${res.status} ${text}`);
  }
  const body = (await res.json()) as { entry?: ClockodoEntry };
  return {
    usersId: body.entry?.users_id != null ? String(body.entry.users_id) : null,
    running: body.entry ? body.entry.time_until == null : null,
  };
}

/** On-demand Clockodo refresh for one user (used by the webhook re-pull path). Gated. */
export const refreshClockodo = gatedAction("activitytrack")({
  args: {
    secret: v.string(),
    employeeId: v.string(),
    clockodoUserId: v.string(),
  },
  handler: async (ctx, { secret, employeeId, clockodoUserId }) => {
    if (secret !== process.env.ACTIVITYTRACK_SIGNAL_SECRET) {
      return { ok: false, error: "forbidden" as const };
    }
    try {
      const day = today();
      const [work, absences] = await Promise.all([
        fetchClockodoWork(clockodoUserId),
        fetchAbsences(),
      ]);
      const absent = isAbsentOn(absences, clockodoUserId, day);
      await ctx.runMutation(api.activity.state.pushSignal, {
        secret,
        employeeId,
        source: "clockodo",
        clockodoWorking: work.working,
        clockodoBreak: work.onBreak,
        clockodoClockedOut: work.clockedOut,
        clockodoClockedOutCertain: work.clockedOutCertain,
        clockodoClockedOutSince: work.clockedOutSince ?? undefined,
        clockodoAbsent: absent,
      });
      console.info(
        `[clockodo:refresh] ${employeeId} — working=${work.working} onBreak=${work.onBreak} clockedOut=${work.clockedOut}${work.clockedOutCertain ? " (certain)" : ""} absent=${absent}`,
      );
      await reportHealth(ctx, "clockodo", "ok");
      return { ok: true as const };
    } catch (err) {
      console.error(`[clockodo:refresh] ${employeeId} failed: ${errMessage(err)}`);
      await reportHealth(ctx, "clockodo", healthStatusOf(err), errMessage(err));
      return { ok: false, error: "clockodo_unavailable" as const };
    }
  },
});

/**
 * Re-pull state from a Clockodo webhook event. Clockodo sends only the id of
 * the changed entry, so we fetch the entry to learn which user it belongs to,
 * then recompute that user's *whole day* from the entries list — the exact
 * derivation the poller uses.
 *
 * The single entry's fields are deliberately not trusted for the verdict:
 * `clocked` means "recorded with the stopwatch" and stays true after clock-out,
 * so an `entry.updated` fired by the clock-out itself used to read as "working
 * again". Only `time_until == null` marks a running entry, and only the full
 * day answers "is anything still running for this user".
 *
 * `usersId` (from the webhook payload) is the fallback for `entry.deleted`,
 * where the entry can no longer be fetched — deleting the running entry must
 * still clear the working state.
 */
export const refreshClockodoByEntry = gatedAction("activitytrack")({
  args: {
    secret: v.string(),
    entryId: v.string(),
    eventName: v.optional(v.string()),
    usersId: v.optional(v.string()),
  },
  handler: async (ctx, { secret, entryId, eventName, usersId }) => {
    if (secret !== process.env.ACTIVITYTRACK_SIGNAL_SECRET) {
      return { ok: false, error: "forbidden" as const };
    }
    console.info(`[clockodo:webhook] received event="${eventName ?? "unknown"}" entry=${entryId}`);
    try {
      const entry = await fetchClockodoEntry(entryId);
      const clockodoUserId = entry.usersId ?? usersId ?? null;

      if (!clockodoUserId) {
        console.info(
          `[clockodo:webhook] entry=${entryId} has no resolvable user (404 and no usersId in payload) — ignored`,
        );
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, ignored: true as const };
      }

      const employeeId = await ctx.runQuery(api.activity.state.resolveEmployeeId, {
        secret,
        clockodoUserId,
      });
      if (!employeeId) {
        console.info(
          `[clockodo:webhook] clockodoUserId=${clockodoUserId} is not mapped to any person — ignored`,
        );
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, unmapped: true as const };
      }

      const [work, absences] = await Promise.all([
        fetchClockodoWork(clockodoUserId),
        fetchAbsences(),
      ]);
      const absent = isAbsentOn(absences, clockodoUserId, today());

      await ctx.runMutation(api.activity.state.pushSignal, {
        secret,
        employeeId,
        source: "clockodo",
        clockodoWorking: work.working,
        clockodoBreak: work.onBreak,
        clockodoClockedOut: work.clockedOut,
        clockodoClockedOutCertain: work.clockedOutCertain,
        clockodoClockedOutSince: work.clockedOutSince ?? undefined,
        clockodoAbsent: absent,
      });

      await ctx.runMutation(internal.activity.events.record, {
        source: "backend",
        severity: "info",
        code: `clockodo.webhook.${eventName ?? "unknown"}`,
        message: `entry=${entryId} employee=${employeeId} → working=${work.working} onBreak=${work.onBreak} clockedOut=${work.clockedOut} (day recompute)`,
        context: JSON.stringify({
          eventName,
          entryId,
          clockodoUserId,
          employeeId,
          entryRunning: entry.running,
          working: work.working,
          onBreak: work.onBreak,
          clockedOut: work.clockedOut,
          absent,
        }),
      });

      await reportHealth(ctx, "clockodo", "ok");
      return { ok: true as const };
    } catch (err) {
      console.error(
        `[clockodo:webhook] entry=${entryId} event="${eventName ?? "unknown"}" failed: ${errMessage(err)}`,
      );
      await reportHealth(ctx, "clockodo", healthStatusOf(err), errMessage(err));
      return { ok: false, error: "clockodo_unavailable" as const };
    }
  },
});

/**
 * Settings → Troubleshooting: "Deep sanitize (Clockodo)". Unlike the live
 * poll (which only asserts the current instant), this deep-fetches an entire
 * day's entries straight from Clockodo and reconciles the recorded history
 * against them — correcting stretches that were wrong under the old UTC-day
 * bug, or that drifted because an entry was edited/deleted in Clockodo after
 * the fact. Per-employee reconciliation (delete-and-rebuild the Clockodo-owned
 * samples for that day) happens in
 * `maintenance.reconcileClockodoDayForEmployee`; this action only owns the
 * HTTP fetch, which mutations can't do.
 */
export const troubleshootSanitizeDay = userAction({
  role: "admin",
  args: { day: v.optional(v.string()) },
  handler: async (ctx, { day }) => {
    const secret = signalSecret();
    const targetDay = day ?? today();
    const dayStartMs = startOfBusinessDayUtcMs(targetDay);
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
    const capMs = Math.min(dayEndMs, Date.now());
    const isPastDayEnd = capMs >= dayEndMs || businessHourOf(capMs) >= BUSINESS_DAY_END_HOUR;

    const mappings = await ctx.runQuery(api.activity.state.mappings, {
      secret,
    });
    const clockodoPeople = mappings.filter((p) => p.clockodoUserId);
    if (clockodoPeople.length === 0) {
      return { peopleProcessed: 0, inserted: 0, deleted: 0, quarantined: 0 };
    }

    const absences = await fetchAbsences(new Date(dayStartMs).getUTCFullYear());

    let peopleProcessed = 0;
    let inserted = 0;
    let deleted = 0;
    let quarantined = 0;

    for (const p of clockodoPeople) {
      const raw = await fetchEntriesForDay(p.clockodoUserId!, dayStartMs, capMs);
      const entries = raw
        .map((e) => ({
          start: e.time_since ? Date.parse(e.time_since) : NaN,
          end: e.time_until ? Date.parse(e.time_until) : null,
        }))
        .filter((e): e is { start: number; end: number | null } => Number.isFinite(e.start))
        .sort((a, b) => a.start - b.start);

      const segments = deriveClockodoDaySegments({
        entries,
        absentWholeDay: isAbsentOn(absences, p.clockodoUserId!, targetDay),
        dayStartMs,
        capMs,
        assumedClockedOutAfterMs: ASSUMED_CLOCKED_OUT_AFTER_MS,
        isPastDayEnd,
      });

      const res = await ctx.runMutation(
        internal.activity.maintenance.reconcileClockodoDayForEmployee,
        { employeeId: p.employeeId, dayStartMs, capMs, segments },
      );
      inserted += res.inserted;
      deleted += res.deleted;
      quarantined += res.quarantined;
      peopleProcessed++;
    }

    console.info(
      `[clockodo:sanitize] day=${targetDay} people=${peopleProcessed} inserted=${inserted} deleted=${deleted} quarantined=${quarantined}`,
    );
    return { peopleProcessed, inserted, deleted, quarantined };
  },
});
