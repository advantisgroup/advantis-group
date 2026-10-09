import { addDays, berlinDate, datesBetween } from "./berlin";
import { regularMinutesOn, type ScheduleLike } from "./schedule";

const MINUTE = 60_000;

export interface SegmentLike {
  kind: "work" | "break";
  start: number;
  end?: number | null;
}

export interface HolidayLike {
  date: string;
  name: string;
  fraction: number;
}

export interface AbsenceLike {
  type: string;
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
}

/** ArbZG §3/§4/§5 hints. Warnings only — nothing is ever deducted. */
export type DayWarning = "break30" | "break45" | "over10h" | "rest11h";

export interface DaySummary {
  date: string;
  /** Contract minutes for the weekday, before holidays and absences. */
  regularMinutes: number;
  targetMinutes: number;
  workedMinutes: number;
  /** All break time of the day, short breaks included. */
  breakMinutes: number;
  /** Break time that counts under ArbZG: pieces of at least 15 minutes. */
  countedBreakMinutes: number;
  firstStart: number | null;
  lastEnd: number | null;
  holiday: HolidayLike | null;
  /** Share of the day covered by approved absences, 0..1. */
  absenceFraction: number;
  absenceTypes: string[];
  warnings: DayWarning[];
  /** A work segment of this day is still running. */
  open: boolean;
}

/** How much of `date` an absence covers: 0, 0.5 on a half first/last day, else 1.
 *  A one-day absence is half as soon as either half-day flag is set. */
export function absenceFractionOn(absence: AbsenceLike, date: string): number {
  if (date < absence.startDate || date > absence.endDate) return 0;
  if (absence.startDate === absence.endDate) {
    return absence.halfDayStart || absence.halfDayEnd ? 0.5 : 1;
  }
  if (date === absence.startDate && absence.halfDayStart) return 0.5;
  if (date === absence.endDate && absence.halfDayEnd) return 0.5;
  return 1;
}

/** The part of a day an absence actually takes off work: nothing on a day
 *  without target hours, and never more than a (half) holiday leaves. This is
 *  also the number of vacation days it uses up on that date. */
export function absenceDaysOn(
  absence: AbsenceLike,
  date: string,
  schedules: readonly ScheduleLike[],
  holidayFraction: number,
): number {
  if (regularMinutesOn(schedules, date) === 0) return 0;
  return Math.min(absenceFractionOn(absence, date), Math.max(0, 1 - holidayFraction));
}

/** Working days an absence spans, holidays and days without target excluded. */
export function absenceWorkingDays(
  absence: AbsenceLike,
  schedules: readonly ScheduleLike[],
  holidays: readonly HolidayLike[],
): number {
  const byDate = new Map(holidays.map((holiday) => [holiday.date, holiday.fraction]));
  return datesBetween(absence.startDate, absence.endDate).reduce(
    (sum, date) => sum + absenceDaysOn(absence, date, schedules, byDate.get(date) ?? 0),
    0,
  );
}

export function targetMinutesOn(
  date: string,
  schedules: readonly ScheduleLike[],
  holiday: HolidayLike | null,
  absences: readonly AbsenceLike[],
): { regular: number; target: number; absenceFraction: number; absenceTypes: string[] } {
  const regular = regularMinutesOn(schedules, date);
  const holidayFraction = Math.min(1, holiday?.fraction ?? 0);
  let absenceFraction = 0;
  const absenceTypes: string[] = [];
  for (const absence of absences) {
    const fraction = absenceFractionOn(absence, date);
    if (fraction === 0) continue;
    absenceTypes.push(absence.type);
    // Überstundenabbau keeps the target: the missing hours come off the
    // hours account instead.
    if (absence.type === "overtime") continue;
    absenceFraction += fraction;
  }
  const off = Math.min(1, holidayFraction + Math.min(absenceFraction, 1 - holidayFraction));
  return {
    regular,
    target: Math.round(regular * (1 - off)),
    absenceFraction: Math.min(1, absenceFraction),
    absenceTypes,
  };
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

interface Span {
  start: number;
  end: number;
}

/**
 * Worked and break time of one day's segments (ms). `breakMs` is every break,
 * short ones included (what the day shows); `countedBreakMs` only the pieces
 * of at least 15 minutes that count under § 4 ArbZG.
 */
export function measureDay(
  segments: readonly SegmentLike[],
  now: number,
): {
  workedMs: number;
  breakMs: number;
  countedBreakMs: number;
  first: number | null;
  last: number | null;
  open: boolean;
} {
  const close = (segment: SegmentLike): Span => ({
    start: segment.start,
    end: Math.max(segment.start, segment.end ?? now),
  });
  const work = segments
    .filter((segment) => segment.kind === "work")
    .map(close)
    .sort((a, b) => a.start - b.start);
  const breaks = segments.filter((segment) => segment.kind === "break").map(close);
  const open = segments.some((segment) => segment.kind === "work" && segment.end == null);

  const merged: Span[] = [];
  for (const span of work) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  const grossMs = merged.reduce((sum, span) => sum + (span.end - span.start), 0);
  const breakPieces = breaks.map((brk) =>
    merged.reduce((sum, span) => sum + overlap(brk.start, brk.end, span.start, span.end), 0),
  );
  const insideBreakMs = breakPieces.reduce((sum, ms) => sum + ms, 0);
  const gaps = merged.slice(1).map((span, index) => span.start - merged[index].end);
  const pieces = [...breakPieces, ...gaps];
  const sum = (list: number[]) => list.reduce((total, ms) => total + ms, 0);

  return {
    workedMs: Math.max(0, grossMs - insideBreakMs),
    breakMs: sum(pieces),
    countedBreakMs: sum(pieces.filter((ms) => ms >= 15 * MINUTE)),
    first: merged[0]?.start ?? null,
    last: merged.at(-1)?.end ?? null,
    open,
  };
}

/**
 * § 4 ArbZG wants 30 minutes of break above 6 hours; the company flags it
 * from 6:15 on (Vahan, 06.10.2026) so a few minutes over don't count. Breaks
 * are never deducted automatically — this is only a note.
 */
export const BREAK30_AFTER_MINUTES = 6 * 60 + 15;

export function dayWarnings(
  workedMinutes: number,
  breakMinutes: number,
  restMinutes: number | null,
): DayWarning[] {
  const warnings: DayWarning[] = [];
  if (workedMinutes > 9 * 60 && breakMinutes < 45) warnings.push("break45");
  else if (workedMinutes > BREAK30_AFTER_MINUTES && breakMinutes < 30) warnings.push("break30");
  if (workedMinutes > 10 * 60) warnings.push("over10h");
  if (restMinutes !== null && restMinutes < 11 * 60) warnings.push("rest11h");
  return warnings;
}

/**
 * Every day from `from` to `to` (inclusive): target, worked, breaks and
 * warnings. A segment belongs to the Berlin date it starts on. Pass the
 * segments of the day before `from` too, so the rest-period check on the
 * first day has something to compare with. Only active entries and approved
 * absences belong in here.
 */
export function summarizeDays(input: {
  from: string;
  to: string;
  segments: readonly SegmentLike[];
  schedules: readonly ScheduleLike[];
  holidays: readonly HolidayLike[];
  absences: readonly AbsenceLike[];
  now: number;
}): DaySummary[] {
  const holidayByDate = new Map(input.holidays.map((holiday) => [holiday.date, holiday]));
  const byDate = new Map<string, SegmentLike[]>();
  for (const segment of input.segments) {
    const date = berlinDate(segment.start);
    const list = byDate.get(date) ?? [];
    list.push(segment);
    byDate.set(date, list);
  }

  let previousLast = measureDay(byDate.get(addDays(input.from, -1)) ?? [], input.now).last;
  return datesBetween(input.from, input.to).map((date) => {
    const measured = measureDay(byDate.get(date) ?? [], input.now);
    const holiday = holidayByDate.get(date) ?? null;
    const target = targetMinutesOn(date, input.schedules, holiday, input.absences);
    const workedMinutes = Math.round(measured.workedMs / MINUTE);
    const breakMinutes = Math.round(measured.breakMs / MINUTE);
    const countedBreakMinutes = Math.round(measured.countedBreakMs / MINUTE);
    const rest =
      previousLast !== null && measured.first !== null
        ? Math.round((measured.first - previousLast) / MINUTE)
        : null;
    previousLast = measured.last ?? null;
    return {
      date,
      regularMinutes: target.regular,
      targetMinutes: target.target,
      workedMinutes,
      breakMinutes,
      countedBreakMinutes,
      firstStart: measured.first,
      lastEnd: measured.last,
      holiday,
      absenceFraction: target.absenceFraction,
      absenceTypes: target.absenceTypes,
      warnings: workedMinutes > 0 ? dayWarnings(workedMinutes, countedBreakMinutes, rest) : [],
      open: measured.open,
    };
  });
}

export function totals(days: readonly DaySummary[]): {
  workedMinutes: number;
  targetMinutes: number;
  balanceMinutes: number;
} {
  const workedMinutes = days.reduce((sum, day) => sum + day.workedMinutes, 0);
  const targetMinutes = days.reduce((sum, day) => sum + day.targetMinutes, 0);
  return { workedMinutes, targetMinutes, balanceMinutes: workedMinutes - targetMinutes };
}
