/**
 * German nationwide public holidays and workday math, ported from the
 * reference script's `werktage.py`. Only the nine holidays that are public
 * holidays in every German state are considered — state-specific ones
 * (Epiphany, Corpus Christi, Reformation Day, All Saints') are deliberately
 * left out, same as the source.
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

/** Today at UTC midnight — the fallback report date when a source file has
 * no detectable date of its own. */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Easter Sunday via the anonymous Gregorian Easter algorithm. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const total = h + l - 7 * m + 114;
  const month = Math.floor(total / 31);
  const day = (total % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidaysCache = new Map<number, Map<string, string>>();

/** Nationwide holidays of a year: ISO date -> name. */
export function holidays(year: number): Map<string, string> {
  const cached = holidaysCache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const entries: [Date, string][] = [
    [new Date(Date.UTC(year, 0, 1)), "Neujahr"],
    [addDays(easter, -2), "Karfreitag"],
    [addDays(easter, 1), "Ostermontag"],
    [new Date(Date.UTC(year, 4, 1)), "Tag der Arbeit"],
    [addDays(easter, 39), "Christi Himmelfahrt"],
    [addDays(easter, 50), "Pfingstmontag"],
    [new Date(Date.UTC(year, 9, 3)), "Tag der Deutschen Einheit"],
    [new Date(Date.UTC(year, 11, 25)), "1. Weihnachtstag"],
    [new Date(Date.UTC(year, 11, 26)), "2. Weihnachtstag"],
  ];
  const map = new Map(entries.map(([d, name]) => [toISODate(d), name]));
  holidaysCache.set(year, map);
  return map;
}

/** Monday–Friday and not a nationwide holiday. */
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
