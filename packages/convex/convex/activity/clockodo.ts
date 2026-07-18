"use node";

import { v } from "convex/values";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { gatedAction } from "../lib/featureGate";
import {
  signalSecret,
  reportHealth,
  healthStatusOf,
  errMessage,
  today,
  type Mapping,
} from "./lib/integrationsShared";
import {
  BUSINESS_DAY_END_HOUR,
  businessHourOf,
  startOfBusinessDayUtcMs,
} from "./lib/businessHours";
import { deriveClockodoDaySegments } from "./lib/clockodoDay";
import { appError } from "./lib/errors";

/**
 * Clockodo time-tracking client, running inside Convex's Node runtime. An open
 * (running) entry means working; dropping the clock mid-day is the "break". The
 * scheduled orchestrator in `integrations.ts` calls `pollClockodo`.
 */

const CLOCKODO_BASE = () =>
  process.env.CLOCKODO_BASE_URL ?? "https://my.clockodo.com";

function clockodoHeaders(): Record<string, string> {
  const apiUser = process.env.CLOCKODO_API_USER;
  const apiKey = process.env.CLOCKODO_API_KEY;
  if (!apiUser || !apiKey) {
    throw new Error("CLOCKODO_API_USER / CLOCKODO_API_KEY not configured");
  }
  return {
    "X-ClockodoApiUser": apiUser,
    "X-ClockodoApiKey": apiKey,
    "X-Clockodo-External-Application": "ActivityTrack",
  };
}

async function clockodoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLOCKODO_BASE()}${path}`, {
    headers: clockodoHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clockodo GET ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

interface Absence {
  users_id?: number;
  date_since?: string;
  date_until?: string;
  status?: number;
}

async function fetchAbsences(year: number): Promise<Absence[]> {
  const qs = `year=${year}&filter[scope]=viewableAbsences`;
  const body = await clockodoGet<{ data?: Absence[] }>(
    `/api/v4/absences?${qs}`
  );
  return body.data ?? [];
}

function isAbsentOn(
  absences: Absence[],
  clockodoUserId: string,
  day: string
): boolean {
  const uid = Number(clockodoUserId);
  return absences.some(
    a =>
      a.users_id === uid &&
      a.status === 1 &&
      !!a.date_since &&
      !!a.date_until &&
      a.date_since <= day &&
      day <= a.date_until
  );
}

function clockodoDate(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

interface ClockodoEntry {
  users_id?: number;
  clocked?: boolean;
  time_since?: string | null;
  time_until?: string | null;
}

/** Deep-fetch every entry for one user in `[sinceMs, untilMs)` — used both by
 * the live poller (today so far) and the "Deep sanitize" troubleshooting
 * button (a whole day, past or present). */
async function fetchEntriesForDay(
  clockodoUserId: string,
  sinceMs: number,
  untilMs: number
): Promise<ClockodoEntry[]> {
  const qs = [
    `time_since=${encodeURIComponent(clockodoDate(new Date(sinceMs)))}`,
    `time_until=${encodeURIComponent(clockodoDate(new Date(untilMs)))}`,
    `filter[users_id]=${encodeURIComponent(clockodoUserId)}`,
  ].join("&");
  const body = await clockodoGet<{ entries?: ClockodoEntry[] }>(
    `/api/v2/entries?${qs}`
  );
  return body.entries ?? [];
}

async function fetchTodayEntries(
  clockodoUserId: string
): Promise<ClockodoEntry[]> {
  // "Today" starts at *business-timezone* midnight, expressed as the UTC
  // instant the API expects — not at `<date>T00:00:00Z`, which is 1-2h into
  // the local day and would miss entries around local midnight.
  return fetchEntriesForDay(
    clockodoUserId,
    startOfBusinessDayUtcMs(),
    Date.now()
  );
}

/**
 * Not-clocked-in gaps up to this long read as a break; anything longer is
 * *assumed* to be the end of the working day (Clockodo has no explicit "day
 * ended" event). The assumption is corrected back to BREAK if the person
 * clocks in again the same day — see `pushSignal`.
 */
const ASSUMED_CLOCKED_OUT_AFTER_MS = 60 * 60_000;

/**
 * From the business day-end hour the guessing stops: anyone who worked today
 * and has nothing running is *definitively* clocked out — no "(assumed)" in
 * the UI, and a later clock-in starts a new stint instead of re-labelling the
 * evening as a break. Hour + timezone live in `lib/businessHours.ts`, shared
 * with the state engine's out-of-hours quarantine.
 */
function isPastDayEnd(): boolean {
  return businessHourOf(Date.now()) >= BUSINESS_DAY_END_HOUR;
}

async function fetchClockodoWork(clockodoUserId: string): Promise<{
  working: boolean;
  onBreak: boolean;
  clockedOut: boolean;
  clockedOutCertain: boolean;
  /**
   * Epoch ms of Clockodo's own last-entry end — the true clock-out instant,
   * independent of whenever this poll happened to notice it. Set whenever
   * `clockedOut` is true; `pushSignal` anchors "since" and the state history
   * to this instead of the poll's own wall-clock time, so a late-running
   * evening poll (or one that missed a whole outage window) doesn't paint a
   * multi-hour "still on break" gap between the real clock-out and whenever
   * we got around to checking.
   */
  clockedOutSince: number | null;
}> {
  const entries = await fetchTodayEntries(clockodoUserId);
  // "Currently clocked in" = an entry with no end time yet. Clockodo's `clocked`
  // flag is NOT that — it marks entries recorded via the stopwatch and stays
  // true after clock-out, so using it here kept people "working" all day once
  // they had clocked in a single time.
  const running = entries.some(e => e.time_until == null);
  if (entries.length === 0) {
    // No entries *today* means the day hasn't started — the person is still
    // clocked out from before. This must be asserted, not left blank: an
    // all-false result here erases the overnight CLOCKED_OUT in the state
    // cache and lets the engine fall through to ACTIVE (the "everyone active
    // from 2 AM" corruption). Certain (not assumed), so the morning clock-in
    // starts a new stint instead of re-labelling the night as a break; no
    // `clockedOutSince` anchor is needed because the state was already
    // CLOCKED_OUT — nothing changes, so no sample is written.
    return {
      working: false,
      onBreak: false,
      clockedOut: true,
      clockedOutCertain: true,
      clockedOutSince: null,
    };
  }
  if (running) {
    return {
      working: true,
      onBreak: false,
      clockedOut: false,
      clockedOutCertain: false,
      clockedOutSince: null,
    };
  }
  // Nothing running — find the true moment the last entry ended, straight
  // from Clockodo, *before* deciding assumed vs certain, so both branches
  // anchor to it. Unparseable end times are skipped so one odd entry can't
  // poison the verdict.
  let lastEnd = 0;
  for (const e of entries) {
    if (!e.time_until) continue;
    const t = Date.parse(e.time_until);
    if (Number.isFinite(t) && t > lastEnd) lastEnd = t;
  }
  if (lastEnd === 0) {
    // Nothing parseable to anchor to — read it as a break rather than guess.
    return {
      working: false,
      onBreak: true,
      clockedOut: false,
      clockedOutCertain: false,
      clockedOutSince: null,
    };
  }
  // Worked today but nothing running. Past the business day-end hour that is
  // no longer a guess — the day is over, full stop.
  if (isPastDayEnd()) {
    return {
      working: false,
      onBreak: false,
      clockedOut: true,
      clockedOutCertain: true,
      clockedOutSince: lastEnd,
    };
  }
  // Before day-end: a short gap is a break, a long one is (assumed to be) the
  // end of the day.
  const clockedOut = Date.now() - lastEnd > ASSUMED_CLOCKED_OUT_AFTER_MS;
  return {
    working: false,
    onBreak: !clockedOut,
    clockedOut,
    clockedOutCertain: false,
    clockedOutSince: clockedOut ? lastEnd : null,
  };
}

async function fetchClockodoEntry(
  id: string
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

/**
 * Poll slice: org-wide approved absences + each mapped user's working/break.
 * Logs one aggregate summary per run rather than per-person — per-person
 * *transitions* are logged where they actually happen, in `pushSignal`, so
 * log volume tracks real events instead of poll frequency.
 */
export async function pollClockodo(
  ctx: ActionCtx,
  secret: string,
  mappings: Mapping[]
): Promise<void> {
  const clockodoPeople = mappings.filter(p => p.clockodoUserId);
  if (clockodoPeople.length === 0) return;
  const tally = { working: 0, onBreak: 0, clockedOut: 0, absent: 0 };
  try {
    const absences = await fetchAbsences(new Date().getFullYear());
    const day = today();
    for (const p of clockodoPeople) {
      const work = await fetchClockodoWork(p.clockodoUserId!);
      const absent = isAbsentOn(absences, p.clockodoUserId!, day);
      if (work.working) tally.working++;
      if (work.onBreak) tally.onBreak++;
      if (work.clockedOut) tally.clockedOut++;
      if (absent) tally.absent++;
      await ctx.runMutation(api.activity.state.pushSignal, {
        secret,
        employeeId: p.employeeId,
        source: "clockodo",
        clockodoWorking: work.working,
        clockodoBreak: work.onBreak,
        clockodoClockedOut: work.clockedOut,
        clockodoClockedOutCertain: work.clockedOutCertain,
        clockodoClockedOutSince: work.clockedOutSince ?? undefined,
        clockodoAbsent: absent,
      });
    }
    console.log(
      `[clockodo:poll] ${clockodoPeople.length} people — working=${tally.working} onBreak=${tally.onBreak} clockedOut=${tally.clockedOut} absent=${tally.absent}`
    );
    await reportHealth(ctx, "clockodo", "ok");
  } catch (err) {
    console.error(
      `[clockodo:poll] failed after processing ${tally.working + tally.onBreak + tally.clockedOut} people: ${errMessage(err)}`
    );
    await reportHealth(ctx, "clockodo", healthStatusOf(err), errMessage(err));
  }
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
        fetchAbsences(new Date().getFullYear()),
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
      console.log(
        `[clockodo:refresh] ${employeeId} — working=${work.working} onBreak=${work.onBreak} clockedOut=${work.clockedOut}${work.clockedOutCertain ? " (certain)" : ""} absent=${absent}`
      );
      await reportHealth(ctx, "clockodo", "ok");
      return { ok: true as const };
    } catch (err) {
      console.error(
        `[clockodo:refresh] ${employeeId} failed: ${errMessage(err)}`
      );
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
    console.log(
      `[clockodo:webhook] received event="${eventName ?? "unknown"}" entry=${entryId}`
    );
    try {
      const entry = await fetchClockodoEntry(entryId);
      const clockodoUserId = entry.usersId ?? usersId ?? null;

      if (!clockodoUserId) {
        console.log(
          `[clockodo:webhook] entry=${entryId} has no resolvable user (404 and no usersId in payload) — ignored`
        );
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, ignored: true as const };
      }

      const employeeId = await ctx.runQuery(
        api.activity.state.resolveEmployeeId,
        {
          secret,
          clockodoUserId,
        }
      );
      if (!employeeId) {
        console.log(
          `[clockodo:webhook] clockodoUserId=${clockodoUserId} is not mapped to any person — ignored`
        );
        await reportHealth(ctx, "clockodo", "ok");
        return { ok: true as const, unmapped: true as const };
      }

      const [work, absences] = await Promise.all([
        fetchClockodoWork(clockodoUserId),
        fetchAbsences(new Date().getFullYear()),
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
        `[clockodo:webhook] entry=${entryId} event="${eventName ?? "unknown"}" failed: ${errMessage(err)}`
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
export const troubleshootSanitizeDay = action({
  args: { day: v.optional(v.string()) },
  handler: async (ctx, { day }) => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me || me.role !== "admin") {
      throw appError("auth.forbidden", "Forbidden: requires admin role");
    }

    const secret = signalSecret();
    const targetDay = day ?? today();
    const dayStartMs = startOfBusinessDayUtcMs(targetDay);
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
    const capMs = Math.min(dayEndMs, Date.now());
    const isPastDayEnd =
      capMs >= dayEndMs || businessHourOf(capMs) >= BUSINESS_DAY_END_HOUR;

    const mappings = await ctx.runQuery(api.activity.state.mappings, {
      secret,
    });
    const clockodoPeople = mappings.filter(p => p.clockodoUserId);
    if (clockodoPeople.length === 0) {
      return { peopleProcessed: 0, inserted: 0, deleted: 0, quarantined: 0 };
    }

    const absences = await fetchAbsences(new Date(dayStartMs).getUTCFullYear());

    let peopleProcessed = 0;
    let inserted = 0;
    let deleted = 0;
    let quarantined = 0;

    for (const p of clockodoPeople) {
      const raw = await fetchEntriesForDay(
        p.clockodoUserId!,
        dayStartMs,
        capMs
      );
      const entries = raw
        .map(e => ({
          start: e.time_since ? Date.parse(e.time_since) : NaN,
          end: e.time_until ? Date.parse(e.time_until) : null,
        }))
        .filter((e): e is { start: number; end: number | null } =>
          Number.isFinite(e.start)
        )
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
        { employeeId: p.employeeId, dayStartMs, capMs, segments }
      );
      inserted += res.inserted;
      deleted += res.deleted;
      quarantined += res.quarantined;
      peopleProcessed++;
    }

    console.log(
      `[clockodo:sanitize] day=${targetDay} people=${peopleProcessed} inserted=${inserted} deleted=${deleted} quarantined=${quarantined}`
    );
    return { peopleProcessed, inserted, deleted, quarantined };
  },
});
