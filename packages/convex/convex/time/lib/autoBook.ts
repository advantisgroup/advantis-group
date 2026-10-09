import { berlinInstant } from "./berlin";

/**
 * Fixed working hours booked automatically for people who don't clock (e.g.
 * the managing director, Vahan 09.10.2026): every day with target hours gets
 * one work segment from `start`, as long as the day's target, plus a break
 * when the day runs over six hours. Holidays, absences and days off come out
 * of the target, so nothing is booked on them; a half holiday books half.
 */
export interface AutoBookSettings {
  /** First day booked (YYYY-MM-DD). */
  from: string;
  /** Start of the working day, "HH:MM" Berlin time. */
  start: string;
  /** Break on days over six hours, in minutes. */
  breakMinutes: number;
}

/** Breaks sit at noon (or as close to it as the day allows). */
export const AUTO_BREAK_AT = 12 * 60;
const BREAK_AFTER = 6 * 60;

export interface PlannedSegment {
  kind: "work" | "break";
  start: number;
  end: number;
}

/** "08:00" → 480, null when it isn't a valid time of day. */
export function clockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isValidAutoBook(settings: AutoBookSettings): boolean {
  const start = clockMinutes(settings.start);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(settings.from) &&
    start !== null &&
    Number.isInteger(settings.breakMinutes) &&
    settings.breakMinutes >= 0 &&
    settings.breakMinutes <= 120
  );
}

/** Minutes of the day (Berlin) the booked segments of one day cover. */
export function autoBookMinutes(
  targetMinutes: number,
  settings: AutoBookSettings,
): { kind: "work" | "break"; from: number; to: number }[] {
  const start = clockMinutes(settings.start);
  if (start === null || targetMinutes <= 0) return [];
  const withBreak = targetMinutes > BREAK_AFTER && settings.breakMinutes > 0;
  const pause = withBreak ? settings.breakMinutes : 0;
  const end = Math.min(start + targetMinutes + pause, 24 * 60 - 1);
  const segments: { kind: "work" | "break"; from: number; to: number }[] = [
    { kind: "work", from: start, to: end },
  ];
  if (withBreak) {
    const breakFrom = Math.min(Math.max(AUTO_BREAK_AT, start + 1), end - pause - 1);
    segments.push({ kind: "break", from: breakFrom, to: breakFrom + pause });
  }
  return segments;
}

/** The segments to book on `date`, as instants. */
export function autoBookDay(
  date: string,
  targetMinutes: number,
  settings: AutoBookSettings,
): PlannedSegment[] {
  return autoBookMinutes(targetMinutes, settings).map((segment) => ({
    kind: segment.kind,
    start: berlinInstant(date, segment.from),
    end: berlinInstant(date, segment.to),
  }));
}

/** Stable id of a booked segment, so re-running a day updates instead of adding. */
export function autoBookId(userId: string, date: string, kind: "work" | "break"): string {
  return `auto:${userId}:${date}:${kind}`;
}
