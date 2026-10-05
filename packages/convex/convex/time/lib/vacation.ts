import { datesBetween } from "./berlin";
import { type AbsenceLike, absenceDaysOn, type HolidayLike } from "./days";
import { type ScheduleLike } from "./schedule";

/** Full-time entitlement when nobody set one for the person and year. */
export const DEFAULT_VACATION_DAYS = 24;

export function carryOverExpiry(year: number): string {
  return `${year}-03-31`;
}

export interface AllowanceLike {
  days: number;
  carriedOver: number;
  carriedOverExpires: string;
}

export interface VacationAbsence extends AbsenceLike {
  status: string;
}

export interface VacationSummary {
  year: number;
  entitlement: number;
  carriedOver: number;
  carriedOverExpires: string;
  /** Carried-over days that lapsed unused (only once the expiry date passed). */
  carriedOverExpired: number;
  /** Carried-over days still usable before they expire. */
  carriedOverLeft: number;
  /** Approved vacation days in the year, past and planned. */
  taken: number;
  pending: number;
  remaining: number;
  remainingAfterPending: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Vacation account of one year. Vacation days taken up to the expiry date
 * (31 March) use the carried-over days first; whatever of those is left after
 * that date lapses.
 */
export function vacationSummary(input: {
  year: number;
  allowance: AllowanceLike | null;
  absences: readonly VacationAbsence[];
  schedules: readonly ScheduleLike[];
  holidays: readonly HolidayLike[];
  asOf: string;
}): VacationSummary {
  const allowance = input.allowance ?? {
    days: DEFAULT_VACATION_DAYS,
    carriedOver: 0,
    carriedOverExpires: carryOverExpiry(input.year),
  };
  const holidayFraction = new Map(
    input.holidays.map((holiday) => [holiday.date, holiday.fraction]),
  );
  const yearStart = `${input.year}-01-01`;
  const yearEnd = `${input.year}-12-31`;

  let taken = 0;
  let takenBeforeExpiry = 0;
  let pending = 0;
  for (const absence of input.absences) {
    if (absence.type !== "vacation") continue;
    if (absence.status !== "approved" && absence.status !== "pending") continue;
    const from = absence.startDate < yearStart ? yearStart : absence.startDate;
    const to = absence.endDate > yearEnd ? yearEnd : absence.endDate;
    if (from > to) continue;
    for (const date of datesBetween(from, to)) {
      const days = absenceDaysOn(absence, date, input.schedules, holidayFraction.get(date) ?? 0);
      if (absence.status === "pending") {
        pending += days;
        continue;
      }
      taken += days;
      if (date <= allowance.carriedOverExpires) takenBeforeExpiry += days;
    }
  }

  const carryUsed = Math.min(allowance.carriedOver, takenBeforeExpiry);
  const expired = input.asOf > allowance.carriedOverExpires;
  const carriedOverExpired = expired ? allowance.carriedOver - carryUsed : 0;
  const remaining = allowance.days + allowance.carriedOver - carriedOverExpired - taken;
  return {
    year: input.year,
    entitlement: allowance.days,
    carriedOver: allowance.carriedOver,
    carriedOverExpires: allowance.carriedOverExpires,
    carriedOverExpired: round(carriedOverExpired),
    carriedOverLeft: round(expired ? 0 : allowance.carriedOver - carryUsed),
    taken: round(taken),
    pending: round(pending),
    remaining: round(remaining),
    remainingAfterPending: round(remaining - pending),
  };
}

/** Days that move into the next year: what's left of `previous` (summarised
 *  as of its 31 December), never negative. */
export function carryOverFrom(previous: VacationSummary): number {
  return Math.max(0, previous.remaining);
}
