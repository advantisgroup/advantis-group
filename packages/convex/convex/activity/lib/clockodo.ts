import { api } from "../../_generated/api";
import { type ActionCtx } from "../../_generated/server";
import { internalApiFetch } from "../../lib/internalApi";
import {
  reportHealth,
  healthStatusOf,
  errMessage,
  today,
  type Mapping,
} from "./integrationsShared";
import { BUSINESS_DAY_END_HOUR, businessHourOf, startOfBusinessDayUtcMs } from "./businessHours";

/**
 * Clockodo time-tracking client, running inside Convex's Node runtime. An open
 * (running) entry means working; dropping the clock mid-day is the "break". The
 * scheduled orchestrator in `integrations.ts` calls `pollClockodo`.
 */

export const CLOCKODO_BASE = () => process.env.CLOCKODO_BASE_URL ?? "https://my.clockodo.com";

export function clockodoHeaders(): Record<string, string> {
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

export async function clockodoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLOCKODO_BASE()}${path}`, {
    headers: clockodoHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clockodo GET ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export interface Absence {
  users_id?: number;
  date_since?: string;
  date_until?: string;
  status?: number;
}

/**
 * The raw Clockodo absences fetch lives in apps/api (`lib/clockodo.ts`) so
 * it isn't duplicated here too — this just calls that internal,
 * server-key-gated endpoint instead of hitting Clockodo directly. Omit
 * `year` for "current" (this year, plus last year's tail in January, same
 * scope the old inline fetch used); pass it to reconcile a specific past day
 * (see `troubleshootSanitizeDay`).
 */
export async function fetchAbsences(year?: number): Promise<Absence[]> {
  const qs = year ? `?year=${year}` : "";
  const res = await internalApiFetch(`/internal/clockodo/absences${qs}`);
  if (!res) {
    throw new Error("API_URL/CONVEX_SERVER_KEY not configured");
  }
  if (!res.ok) {
    throw new Error(`apps/api GET /internal/clockodo/absences failed: ${res.status}`);
  }
  const body = (await res.json()) as { absences?: Absence[] };
  return body.absences ?? [];
}

export function isAbsentOn(absences: Absence[], clockodoUserId: string, day: string): boolean {
  const uid = Number(clockodoUserId);
  return absences.some(
    (a) =>
      a.users_id === uid &&
      a.status === 1 &&
      !!a.date_since &&
      !!a.date_until &&
      a.date_since <= day &&
      day <= a.date_until,
  );
}

export function clockodoDate(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface ClockodoEntry {
  users_id?: number;
  clocked?: boolean;
  time_since?: string | null;
  time_until?: string | null;
}

/** Deep-fetch every entry for one user in `[sinceMs, untilMs)` — used both by
 * the live poller (today so far) and the "Deep sanitize" troubleshooting
 * button (a whole day, past or present). */
export async function fetchEntriesForDay(
  clockodoUserId: string,
  sinceMs: number,
  untilMs: number,
): Promise<ClockodoEntry[]> {
  const qs = [
    `time_since=${encodeURIComponent(clockodoDate(new Date(sinceMs)))}`,
    `time_until=${encodeURIComponent(clockodoDate(new Date(untilMs)))}`,
    `filter[users_id]=${encodeURIComponent(clockodoUserId)}`,
  ].join("&");
  const body = await clockodoGet<{ entries?: ClockodoEntry[] }>(`/api/v2/entries?${qs}`);
  return body.entries ?? [];
}

export async function fetchTodayEntries(clockodoUserId: string): Promise<ClockodoEntry[]> {
  // "Today" starts at *business-timezone* midnight, expressed as the UTC
  // instant the API expects — not at `<date>T00:00:00Z`, which is 1-2h into
  // the local day and would miss entries around local midnight.
  return fetchEntriesForDay(clockodoUserId, startOfBusinessDayUtcMs(), Date.now());
}

/**
 * Not-clocked-in gaps up to this long read as a break; anything longer is
 * *assumed* to be the end of the working day (Clockodo has no explicit "day
 * ended" event). The assumption is corrected back to BREAK if the person
 * clocks in again the same day — see `pushSignal`.
 */
export const ASSUMED_CLOCKED_OUT_AFTER_MS = 60 * 60_000;

/**
 * From the business day-end hour the guessing stops: anyone who worked today
 * and has nothing running is *definitively* clocked out — no "(assumed)" in
 * the UI, and a later clock-in starts a new stint instead of re-labelling the
 * evening as a break. Hour + timezone live in `lib/businessHours.ts`, shared
 * with the state engine's out-of-hours quarantine.
 */
export function isPastDayEnd(): boolean {
  return businessHourOf(Date.now()) >= BUSINESS_DAY_END_HOUR;
}

export async function fetchClockodoWork(clockodoUserId: string): Promise<{
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
  const running = entries.some((e) => e.time_until == null);
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

/**
 * Poll slice: org-wide approved absences + each mapped user's working/break.
 * Logs one aggregate summary per run rather than per-person — per-person
 * *transitions* are logged where they actually happen, in `pushSignal`, so
 * log volume tracks real events instead of poll frequency.
 */
export async function pollClockodo(
  ctx: ActionCtx,
  secret: string,
  mappings: Mapping[],
): Promise<void> {
  const clockodoPeople = mappings.filter((p) => p.clockodoUserId);
  if (clockodoPeople.length === 0) return;
  const tally = { working: 0, onBreak: 0, clockedOut: 0, absent: 0 };
  try {
    const absences = await fetchAbsences();
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
    console.info(
      `[clockodo:poll] ${clockodoPeople.length} people — working=${tally.working} onBreak=${tally.onBreak} clockedOut=${tally.clockedOut} absent=${tally.absent}`,
    );
    await reportHealth(ctx, "clockodo", "ok");
  } catch (err) {
    console.error(
      `[clockodo:poll] failed after processing ${tally.working + tally.onBreak + tally.clockedOut} people: ${errMessage(err)}`,
    );
    await reportHealth(ctx, "clockodo", healthStatusOf(err), errMessage(err));
  }
}
