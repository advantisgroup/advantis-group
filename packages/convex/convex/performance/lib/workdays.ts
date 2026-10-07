import { bavarianHolidays } from "../../time/lib/holidays";
import { berlinDate } from "../../time/lib/berlin";

/**
 * Workday math for the Performance forecasts. Days off are the same as in
 * the Zeiterfassung: Bavarian (Nürnberg) public holidays plus the company's
 * own full days off (`time/lib/holidays.ts`). Half days (24.12., 31.12.)
 * still count as workdays.
 *
 * Dates are handled as UTC-midnight `Date`s internally (so day arithmetic
 * never shifts across a local-timezone DST boundary) and as ISO
 * "YYYY-MM-DD" strings at the API boundary, matching `performanceReports`.
 */

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date in Berlin (as a UTC-midnight `Date`, like every date here).
 * Between midnight and 02:00 German time UTC is still on the previous day,
 * which used to file late-night uploads and "today" on the wrong date. */
export function todayBerlin(): Date {
  return parseISODate(berlinDate(Date.now()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

const holidaysCache = new Map<number, Map<string, string>>();

/** Full days off of a year (Nürnberg + company rules): ISO date -> name. */
export function holidays(year: number): Map<string, string> {
  const cached = holidaysCache.get(year);
  if (cached) return cached;
  const map = new Map(
    bavarianHolidays(year)
      .filter((h) => h.fraction >= 1)
      .map((h) => [h.date, h.name] as const),
  );
  holidaysCache.set(year, map);
  return map;
}

/** Monday–Friday and not a day off. */
export function isWorkday(d: Date): boolean {
  const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;
  return !holidays(d.getUTCFullYear()).has(toISODate(d));
}

/** Number of workdays from `start` to `end`, both inclusive. */
export function workdaysBetween(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) return 0;
  let n = 0;
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    if (isWorkday(d)) n++;
  }
  return n;
}

function monthBoundsUTC(ym: string): { start: Date; end: Date } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = addDays(new Date(Date.UTC(y, m, 1)), -1);
  return { start, end };
}

/** Total workdays in month `"YYYY-MM"`. */
export function monthWorkdays(ym: string): number {
  const { start, end } = monthBoundsUTC(ym);
  return workdaysBetween(start, end);
}

/** Holidays of a month that fall on a Monday–Friday. */
export function monthHolidays(ym: string): { date: string; name: string }[] {
  const [y, m] = ym.split("-").map(Number);
  const out: { date: string; name: string }[] = [];
  for (const [iso, name] of holidays(y)) {
    const d = parseISODate(iso);
    const day = d.getUTCDay();
    if (d.getUTCMonth() + 1 === m && day !== 0 && day !== 6) {
      out.push({ date: iso, name });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Workdays already elapsed in the month up to and including `asOf`. If
 * `asOf` is after month-end, the whole month counts. */
export function workdaysElapsed(ym: string, asOf: Date): number {
  const { start, end } = monthBoundsUTC(ym);
  if (asOf.getTime() < start.getTime()) return 0;
  const cappedEnd = asOf.getTime() < end.getTime() ? asOf : end;
  return workdaysBetween(start, cappedEnd);
}

export interface Forecast {
  total: number;
  elapsed: number;
  remaining: number;
  perDay: number | null;
  fc1: number | null;
  isActual: boolean;
}

/** FC1 projection for a cumulative monthly value, on a workday basis (used
 * for the team / months without call data — see `performance/lib/kpi.ts`
 * for the per-employee "worked days" variant). */
export function forecast(value: number | null, ym: string, asOf: Date): Forecast {
  const total = monthWorkdays(ym);
  const elapsed = workdaysElapsed(ym, asOf);
  const remaining = Math.max(total - elapsed, 0);
  const isActual = remaining === 0;
  const perDay = value !== null && elapsed ? Math.round((value / elapsed) * 100) / 100 : null;
  let fc1: number | null;
  if (value === null) {
    fc1 = null;
  } else if (isActual) {
    fc1 = value; // completed month: actual = forecast
  } else if (perDay !== null) {
    fc1 = Math.round(perDay * total);
  } else {
    fc1 = null;
  }
  return { total, elapsed, remaining, perDay, fc1, isActual };
}
