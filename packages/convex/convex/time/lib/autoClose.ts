import { addDays, berlinDate, berlinInstant } from "./berlin";

const MINUTE = 60_000;

/** 18:00 Europe/Berlin: still-open work entries are closed from here on. */
export const AUTO_CLOSE_MINUTE_OF_DAY = 18 * 60;

/** The first 18:00 (Berlin) strictly after `start` — when that entry is due. */
export function autoCloseCutoff(start: number): number {
  const date = berlinDate(start);
  const sameDay = berlinInstant(date, AUTO_CLOSE_MINUTE_OF_DAY);
  return start < sameDay ? sameDay : berlinInstant(addDays(date, 1), AUTO_CLOSE_MINUTE_OF_DAY);
}

/**
 * The end the 18:00 rule books for a forgotten clock-out: the person's
 * regular hours for the weekday, less what earlier closed segments of the day
 * already booked, counted from the open entry's start — which for the usual
 * single entry is "first start + regular hours". Breaks already taken inside
 * the entry push the end back by their length, so they aren't counted as
 * work. Never before the start, never after the cutoff.
 */
export function autoCloseEnd(input: {
  start: number;
  cutoff: number;
  regularMinutes: number;
  earlierWorkedMinutes: number;
  breakMinutesInside: number;
}): number {
  const remaining = Math.max(0, input.regularMinutes - input.earlierWorkedMinutes);
  const end = input.start + (remaining + input.breakMinutesInside) * MINUTE;
  return Math.min(input.cutoff, Math.max(input.start, end));
}
