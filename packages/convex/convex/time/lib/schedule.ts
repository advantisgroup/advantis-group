import { weekdayOf } from "./berlin";

/** 8 h Monday to Friday — the default for anyone without a schedule row. */
export const DEFAULT_MINUTES_PER_WEEKDAY: readonly number[] = [480, 480, 480, 480, 480, 0, 0];

export interface ScheduleLike {
  validFrom: string;
  minutesPerWeekday: readonly number[];
}

/** The schedule in force on `date`: the one with the latest `validFrom` on or
 *  before it, else the default. */
export function scheduleOn(schedules: readonly ScheduleLike[], date: string): readonly number[] {
  let best: ScheduleLike | null = null;
  for (const schedule of schedules) {
    if (schedule.validFrom <= date && (!best || schedule.validFrom > best.validFrom)) {
      best = schedule;
    }
  }
  return best?.minutesPerWeekday ?? DEFAULT_MINUTES_PER_WEEKDAY;
}

/** Contract minutes for `date` before holidays and absences. */
export function regularMinutesOn(schedules: readonly ScheduleLike[], date: string): number {
  return scheduleOn(schedules, date)[weekdayOf(date)] ?? 0;
}

export function isValidWeek(minutes: readonly number[]): boolean {
  return (
    minutes.length === 7 &&
    minutes.every((value) => Number.isInteger(value) && value >= 0 && value <= 24 * 60)
  );
}
