/**
 * Aggregation helpers for the ActivityTrack reports, ported from
 * ActivityTrack's `lib/activity.ts`.
 */
import { localDay } from "./fmt";

export interface DeviceDaily {
  day: string;
  activeSeconds: number;
  idleSeconds: number;
}

export interface DeviceReportRow {
  deviceId: string;
  hostname: string;
  personName: string | null;
  daily: DeviceDaily[];
}

/** YYYY-MM-DD list spanning [start, end] inclusive. */
export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Per-day totals (hours) across every device, for the trend chart. */
export function aggregateDailyTotals(
  rows: DeviceReportRow[],
  days: string[]
): { day: string; activeHours: number; idleHours: number }[] {
  const byDay = new Map<string, { active: number; idle: number }>();
  for (const day of days) byDay.set(day, { active: 0, idle: 0 });
  for (const row of rows) {
    for (const d of row.daily) {
      const acc = byDay.get(d.day);
      if (!acc) continue;
      acc.active += d.activeSeconds;
      acc.idle += d.idleSeconds;
    }
  }
  return days.map(day => {
    const acc = byDay.get(day)!;
    return {
      day,
      activeHours: +(acc.active / 3600).toFixed(2),
      idleHours: +(acc.idle / 3600).toFixed(2),
    };
  });
}

/** Per-device totals over the whole window, sorted by active time desc. */
export function aggregatePerDevice(rows: DeviceReportRow[]): {
  deviceId: string;
  hostname: string;
  personName: string | null;
  activeSeconds: number;
  idleSeconds: number;
}[] {
  return rows
    .map(row => ({
      deviceId: row.deviceId,
      hostname: row.hostname,
      personName: row.personName,
      activeSeconds: row.daily.reduce((s, d) => s + d.activeSeconds, 0),
      idleSeconds: row.daily.reduce((s, d) => s + d.idleSeconds, 0),
    }))
    .sort((a, b) => b.activeSeconds - a.activeSeconds);
}

/* ───────────────────────────────────────────────────────────────────────
   Chart / timeline aggregations ported from ActivityTrack web's lib/activity.ts.
   ─────────────────────────────────────────────────────────────────────── */

export interface Sample {
  capturedAt: number;
  active: boolean;
  idleMs: number;
}

export interface DailyStat {
  day: string; // YYYY-MM-DD
  activeSeconds: number;
  idleSeconds: number;
}

/** One bar per day: active vs idle hours. Fills gaps in [startDay, endDay]. */
export function dailyTrend(
  stats: DailyStat[],
  startDay: string,
  endDay: string,
): Array<{ day: string; label: string; activeHours: number; idleHours: number }> {
  const byDay = new Map(stats.map((s) => [s.day, s]));
  const out: Array<{
    day: string;
    label: string;
    activeHours: number;
    idleHours: number;
  }> = [];
  const cursor = new Date(`${startDay}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    const s = byDay.get(day);
    out.push({
      day,
      label: `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`,
      activeHours: s ? +(s.activeSeconds / 3600).toFixed(2) : 0,
      idleHours: s ? +(s.idleSeconds / 3600).toFixed(2) : 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * 24 buckets (one per local hour) giving the share of samples that were active.
 * Powers the "activity by time of day" heatmap strip. Callers pass a single
 * day's samples so the strip is today-scoped (not a multi-day blend, which would
 * light hours later than "now" and read like future data).
 * `tzOffsetMinutes` is the browser's timezone offset (from Date.prototype.getTimezoneOffset).
 */
export function hourOfDayActivity(
  samples: Sample[],
  tzOffsetMinutes = 0,
): Array<{ hour: number; ratio: number; total: number }> {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    active: 0,
    total: 0,
  }));
  for (const s of samples) {
    const h = new Date(s.capturedAt - tzOffsetMinutes * 60_000).getUTCHours();
    buckets[h].total += 1;
    if (s.active) buckets[h].active += 1;
  }
  return buckets.map((b) => ({
    hour: b.hour,
    total: b.total,
    ratio: b.total === 0 ? 0 : b.active / b.total,
  }));
}

/** The six fused employee states, matching the backend `stateSamples.state`. */
export type StateName =
  | "ABSENT"
  | "BREAK"
  | "IN_CALL"
  | "WRAP_UP"
  | "ACTIVE"
  | "IDLE";

export const STATE_NAMES: StateName[] = [
  "ACTIVE",
  "IN_CALL",
  "WRAP_UP",
  "IDLE",
  "BREAK",
  "ABSENT",
];

export interface StateSample {
  state: StateName;
  at: number;
}

/**
 * Whether a fused state counts as "working" for fleet tallies and labels.
 * ACTIVE / IN_CALL / WRAP_UP are working; BREAK / ABSENT / IDLE are not. When no
 * fused state exists yet (`null`), fall back to the device's raw active flag so
 * unlinked devices still read sensibly.
 */
export function isWorkingState(
  finalState: StateName | null | undefined,
  fallbackActive: boolean,
): boolean {
  if (finalState == null) return fallbackActive;
  return (
    finalState === "ACTIVE" ||
    finalState === "IN_CALL" ||
    finalState === "WRAP_UP"
  );
}

export type HourStateBucket = { hour: number } & Record<StateName, number>;

function emptyHourBuckets(): HourStateBucket[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    ACTIVE: 0,
    IN_CALL: 0,
    WRAP_UP: 0,
    IDLE: 0,
    BREAK: 0,
    ABSENT: 0,
  }));
}

/**
 * Minutes spent in each fused state, bucketed by local hour of day, over the
 * window `[windowStart, windowEnd]`. `samples` are on-change state rows (asc by
 * `at`); each one's state holds until the next sample (or `windowEnd` for the
 * last). Intervals are split at hour boundaries so a state spanning multiple
 * hours is credited proportionally. Powers the per-hour timeline breakdown.
 * `tzOffsetMinutes` is the browser's timezone offset (from Date.prototype.getTimezoneOffset).
 */
export function hourlyStateBreakdown(
  samples: StateSample[],
  windowStart: number,
  windowEnd: number,
  tzOffsetMinutes = 0,
): HourStateBucket[] {
  const buckets = emptyHourBuckets();
  if (samples.length === 0 || windowEnd <= windowStart) return buckets;

  for (let i = 0; i < samples.length; i++) {
    const segStart = Math.max(samples[i].at, windowStart);
    const rawEnd = i + 1 < samples.length ? samples[i + 1].at : windowEnd;
    const segEnd = Math.min(rawEnd, windowEnd);
    if (segEnd <= segStart) continue;

    const state = samples[i].state;
    let cur = segStart;
    while (cur < segEnd) {
      // `shifted` is the instant expressed as "fake UTC" local time, so its
      // UTC hour IS the local hour. The next local-hour boundary is computed in
      // that shifted frame, then converted *back to real epoch* before we clamp
      // or measure — mixing the two frames was crediting a whole multi-hour span
      // to its start hour instead of splitting it.
      const shifted = cur - tzOffsetMinutes * 60_000;
      const hour = new Date(shifted).getUTCHours();
      const nextHourShifted =
        Math.floor(shifted / 3_600_000) * 3_600_000 + 3_600_000;
      const hourEnd = nextHourShifted + tzOffsetMinutes * 60_000;
      const chunkEnd = Math.min(hourEnd, segEnd);
      buckets[hour][state] += (chunkEnd - cur) / 60_000;
      cur = chunkEnd;
    }
  }

  // Round for stable rendering/tooltips.
  for (const b of buckets) {
    for (const s of STATE_NAMES) b[s] = +b[s].toFixed(1);
  }
  return buckets;
}

/**
 * Activity through the most recent day, in `slotMinutes` buckets, as the percent
 * of samples that were active. Only buckets covered by samples are returned.
 */
export function intradayTimeline(
  samples: Sample[],
  slotMinutes = 30,
): Array<{ t: number; label: string; activePct: number }> {
  if (samples.length === 0) return [];
  const slotMs = slotMinutes * 60_000;
  const map = new Map<number, { active: number; total: number }>();
  for (const s of samples) {
    const slot = Math.floor(s.capturedAt / slotMs) * slotMs;
    const cur = map.get(slot) ?? { active: 0, total: 0 };
    cur.total += 1;
    if (s.active) cur.active += 1;
    map.set(slot, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({
      t,
      label: new Date(t).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
      activePct: Math.round((v.active / v.total) * 100),
    }));
}

/**
 * The two sample-based charts (hour heatmap + intraday) for one specific local
 * `day` (YYYY-MM-DD). Scopes to *that* day only — so a stale device shows an
 * empty chart for today rather than silently rendering its last active day's
 * data under a "today" label. Pure, so the scoping is covered by tests.
 */
export function timelineCharts(
  samples: Sample[],
  day: string,
  tzOffsetMinutes = 0,
): {
  heatmap: ReturnType<typeof hourOfDayActivity>;
  intraday: ReturnType<typeof intradayTimeline>;
} {
  const inDay = samples.filter(
    (s) => localDay(s.capturedAt, tzOffsetMinutes) === day,
  );
  return {
    heatmap: hourOfDayActivity(inDay, tzOffsetMinutes),
    intraday: intradayTimeline(inDay, 30),
  };
}

/**
 * Newest local day that actually has a sample, or `null` when there are none.
 * `samples` are descending by `capturedAt` (as `recentSamples` returns), so the
 * first row is the newest. Powers the "rewind to last active day" affordance.
 */
export function lastActiveDay(
  samples: Sample[],
  tzOffsetMinutes = 0,
): string | null {
  return samples.length > 0
    ? localDay(samples[0].capturedAt, tzOffsetMinutes)
    : null;
}

// ── Day-in-detail (minute-level) ───────────────────────────────────────────

export interface StateSegment {
  state: StateName;
  start: number; // epoch ms, clamped to the day window
  end: number; // epoch ms, clamped to the day window
}

/**
 * Contiguous state runs across `[dayStart, dayEnd]`, for the horizontal timeline
 * strip. Each on-change `samples` row holds until the next one (or `dayEnd`).
 * Adjacent runs of the same state are merged so the strip draws one block per
 * stretch. `samples` must be ascending by `at` (as `state.history` returns).
 */
export function dayStateSegments(
  samples: StateSample[],
  dayStart: number,
  dayEnd: number,
): StateSegment[] {
  const segments: StateSegment[] = [];
  if (samples.length === 0 || dayEnd <= dayStart) return segments;

  for (let i = 0; i < samples.length; i++) {
    const start = Math.max(samples[i].at, dayStart);
    const rawEnd = i + 1 < samples.length ? samples[i + 1].at : dayEnd;
    const end = Math.min(rawEnd, dayEnd);
    if (end <= start) continue;

    const last = segments[segments.length - 1];
    if (last && last.state === samples[i].state && last.end === start) {
      last.end = end; // merge touching same-state runs
    } else {
      segments.push({ state: samples[i].state, start, end });
    }
  }
  return segments;
}

/**
 * The fused state in effect for each minute of `[dayStart, dayEnd]`, as a dense
 * array (one slot per minute, `null` where no state is known). Powers the
 * hover-anywhere minute grid. Derived from the same segments as the strip.
 */
export function minuteStates(
  samples: StateSample[],
  dayStart: number,
  dayEnd: number,
): Array<StateName | null> {
  const totalMinutes = Math.max(0, Math.round((dayEnd - dayStart) / 60_000));
  const out: Array<StateName | null> = Array.from({ length: totalMinutes }, () => null);
  for (const seg of dayStateSegments(samples, dayStart, dayEnd)) {
    const from = Math.floor((seg.start - dayStart) / 60_000);
    const to = Math.ceil((seg.end - dayStart) / 60_000);
    for (let m = Math.max(0, from); m < Math.min(totalMinutes, to); m++) {
      out[m] = seg.state;
    }
  }
  return out;
}

// ── Weekly rollups (Reports page) ──────────────────────────────────────────

/** Sum a device's daily rows to active/idle seconds over the whole range. */
export function sumDaily(daily: DailyStat[]): {
  activeSeconds: number;
  idleSeconds: number;
} {
  return daily.reduce(
    (acc, d) => ({
      activeSeconds: acc.activeSeconds + d.activeSeconds,
      idleSeconds: acc.idleSeconds + d.idleSeconds,
    }),
    { activeSeconds: 0, idleSeconds: 0 },
  );
}

/** Monday (ISO week start) as YYYY-MM-DD for a given YYYY-MM-DD day. */
export function weekStartOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Group daily rows into ISO weeks (Mon-start) across `[startDay, endDay]`,
 * filling empty weeks with zeroes so the trend chart has one bar per week.
 */
export function weeklyTrend(
  daily: DailyStat[],
  startDay: string,
  endDay: string,
): Array<{
  weekStart: string;
  label: string;
  activeHours: number;
  idleHours: number;
}> {
  const byWeek = new Map<string, { active: number; idle: number }>();
  for (const d of daily) {
    if (d.day < startDay || d.day > endDay) continue;
    const wk = weekStartOf(d.day);
    const cur = byWeek.get(wk) ?? { active: 0, idle: 0 };
    cur.active += d.activeSeconds;
    cur.idle += d.idleSeconds;
    byWeek.set(wk, cur);
  }

  const out: Array<{
    weekStart: string;
    label: string;
    activeHours: number;
    idleHours: number;
  }> = [];
  const cursor = new Date(`${weekStartOf(startDay)}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  while (cursor <= end) {
    const wk = cursor.toISOString().slice(0, 10);
    const v = byWeek.get(wk) ?? { active: 0, idle: 0 };
    out.push({
      weekStart: wk,
      label: `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`,
      activeHours: +(v.active / 3600).toFixed(2),
      idleHours: +(v.idle / 3600).toFixed(2),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
}
