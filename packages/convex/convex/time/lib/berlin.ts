/**
 * Europe/Berlin calendar arithmetic without `Intl`: CET (UTC+1) in winter,
 * CEST (UTC+2) from the last Sunday of March 01:00 UTC to the last Sunday of
 * October 01:00 UTC (the EU rule). Dates are ISO `YYYY-MM-DD` strings,
 * instants are UTC epoch milliseconds.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

export const TIME_ZONE = "Europe/Berlin";

function lastSundayUtc(year: number, monthIndex: number): number {
  const lastDay = Date.UTC(year, monthIndex + 1, 0);
  const weekday = new Date(lastDay).getUTCDay();
  return lastDay - weekday * DAY;
}

/** Minutes Berlin is ahead of UTC at `instant` (60 or 120). */
export function berlinOffsetMinutes(instant: number): number {
  const year = new Date(instant).getUTCFullYear();
  const start = lastSundayUtc(year, 2) + 60 * MINUTE;
  const end = lastSundayUtc(year, 9) + 60 * MINUTE;
  return instant >= start && instant < end ? 120 : 60;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export interface BerlinParts {
  date: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

export function berlinParts(instant: number): BerlinParts {
  const local = new Date(instant + berlinOffsetMinutes(instant) * MINUTE);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    weekday: (local.getUTCDay() + 6) % 7,
  };
}

/** The Berlin calendar date an instant falls on. */
export function berlinDate(instant: number): string {
  return berlinParts(instant).date;
}

function wallClockUtc(date: string, minutesOfDay: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + minutesOfDay * MINUTE;
}

/**
 * The instant a Berlin wall-clock time happens. A time skipped by the spring
 * change (02:30) resolves to the instant an hour later; a time that happens
 * twice in autumn resolves to the first (CEST) occurrence.
 */
export function berlinInstant(date: string, minutesOfDay = 0): number {
  const wall = wallClockUtc(date, minutesOfDay);
  const summer = wall - 120 * MINUTE;
  if (berlinOffsetMinutes(summer) === 120) return summer;
  return wall - 60 * MINUTE;
}

export function addDays(date: string, days: number): string {
  return new Date(wallClockUtc(date, 0) + days * DAY).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: string): number {
  return (new Date(wallClockUtc(date, 0)).getUTCDay() + 6) % 7;
}

/** Inclusive list of dates from `from` to `to`. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) out.push(date);
  return out;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function addMonths(month: string, count: number): string {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + count, 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
}

/** Inclusive list of months touched by the dates `from`..`to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let month = monthOf(from); month <= monthOf(to); month = addMonths(month, 1)) {
    out.push(month);
  }
  return out;
}

export function mondayOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && addDays(value, 0) === value;
}

export function isIsoMonth(value: string): boolean {
  return ISO_MONTH.test(value);
}
