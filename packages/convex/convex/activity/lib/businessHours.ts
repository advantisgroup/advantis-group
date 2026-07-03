import type { EmployeeState } from "./state";

/**
 * The business-hours window for the fused employee state, in the company's
 * timezone. This is the single source of truth for "when does a workday
 * plausibly happen" — the Clockodo poller's day boundary, the day-end
 * "clock-out is certain" hour, and the out-of-hours signal quarantine in
 * `pushSignal` all derive from it.
 *
 * Why it exists: every raw timestamp in the pipeline is epoch ms (fine), but
 * any *calendar* decision — "today's entries", "the day has ended", "nobody
 * works at 3 AM" — must be made in local wall-clock time. Using UTC for those
 * decisions is exactly what painted people ACTIVE from 02:00 (= 00:00 UTC in
 * summer): the Clockodo "today" window flipped at UTC midnight, emptied, and
 * the state engine's fall-through default did the rest.
 */

export const BUSINESS_TIME_ZONE =
  process.env.ACTIVITY_TIMEZONE ??
  process.env.CLOCKODO_TIMEZONE ??
  "Europe/Berlin";

/** Work can plausibly start from this local hour … */
export const BUSINESS_DAY_START_HOUR = Number(
  process.env.ACTIVITY_DAY_START_HOUR ?? "7"
);
/** … and the day is over from this local hour (also the "clock-out is
 * certain" threshold, historically `CLOCKODO_DAY_END_HOUR`). */
export const BUSINESS_DAY_END_HOUR = Number(
  process.env.CLOCKODO_DAY_END_HOUR ?? "20"
);

/**
 * States that assert someone is (or was just) working. Only these are
 * quarantined outside business hours — CLOCKED_OUT and ABSENT say the
 * opposite and must always be allowed to land (the evening "clock-out is now
 * certain" transition happens at/after the day-end hour by definition).
 */
export const WORK_EVIDENCE_STATES: ReadonlySet<EmployeeState> = new Set([
  "ACTIVE",
  "IDLE",
  "IN_CALL",
  "WRAP_UP",
  "BREAK",
]);

interface LocalParts {
  /** Calendar date as YYYY-MM-DD. */
  date: string;
  hour: number;
  minute: number;
}

/** Wall-clock date/time of an instant in the business timezone. Falls back to
 * UTC if the runtime lacks timezone data — never throws. */
export function businessLocalParts(at: number): LocalParts {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(at));
    const get = (type: string) =>
      parts.find(p => p.type === type)?.value ?? "";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(hour)) {
      return { date, hour, minute: Number.isFinite(minute) ? minute : 0 };
    }
  } catch {
    // fall through to UTC below
  }
  const d = new Date(at);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Local calendar day (YYYY-MM-DD) of an instant in the business timezone. */
export function businessDayOf(at: number): string {
  return businessLocalParts(at).date;
}

/** Local hour (0-23) of an instant in the business timezone. */
export function businessHourOf(at: number): number {
  return businessLocalParts(at).hour;
}

/** Whether an instant falls inside the business-hours window. */
export function isWithinBusinessHours(at: number): boolean {
  const hour = businessHourOf(at);
  return hour >= BUSINESS_DAY_START_HOUR && hour < BUSINESS_DAY_END_HOUR;
}

/**
 * The UTC instant (epoch ms) of local midnight for a business-timezone
 * calendar day. Starts from the naive UTC-midnight guess and corrects by the
 * zone offset observed at the guess; the second pass absorbs DST transitions
 * at the boundary.
 */
export function startOfBusinessDayUtcMs(
  day: string = businessDayOf(Date.now())
): number {
  const target = Date.parse(`${day}T00:00:00Z`);
  let ts = target;
  for (let i = 0; i < 2; i++) {
    const p = businessLocalParts(ts);
    const seen = Date.parse(
      `${p.date}T${String(p.hour).padStart(2, "0")}:${String(
        p.minute
      ).padStart(2, "0")}:00Z`
    );
    ts -= seen - target;
  }
  return ts;
}
