import { absenceFractionOn, type AbsenceLike } from "../time/lib/days";
import { regularMinutesOn, type ScheduleLike } from "../time/lib/schedule";

/**
 * Anyone contracted for less than this on a weekday works a half day there
 * and gets no kitchen duty (Vahan, 09.11.2026). Six hours keeps a short
 * Friday of a full-timer in the rotation.
 */
export const KITCHEN_MIN_MINUTES = 6 * 60;

export interface KitchenPerson<Id extends string = string> {
  userId: Id;
  schedules: readonly ScheduleLike[];
  /** Approved and still pending absences. */
  absences: readonly AbsenceLike[];
}

export interface KitchenDay<Id extends string = string> {
  date: string;
  userId: Id | null;
  /** Everyone who could do this day. */
  candidates: Id[];
}

/** A half absence counts too: that person is gone before the kitchen is due. */
export function canDoKitchen(person: KitchenPerson, date: string, dayOff: boolean): boolean {
  if (dayOff) return false;
  if (regularMinutesOn(person.schedules, date) < KITCHEN_MIN_MINUTES) return false;
  return !person.absences.some((absence) => absenceFractionOn(absence, date) > 0);
}

/**
 * Reihum: each day goes to whoever did the kitchen longest ago, so someone
 * back from vacation is next up instead of owing every day they missed. A day
 * already planned stays with its person as long as they can still do it, which
 * also keeps accepted swaps when a period is planned again. `people` order
 * breaks ties.
 */
export function proposeKitchenPlan<Id extends string>(input: {
  dates: readonly string[];
  people: readonly KitchenPerson<Id>[];
  /** Holidays (half ones included) and office closures. */
  daysOff: ReadonlySet<string>;
  existing: ReadonlyMap<string, Id>;
  /** Each person's latest duty before the first date. */
  lastDuty: ReadonlyMap<Id, string>;
}): KitchenDay<Id>[] {
  const last = new Map(input.lastDuty);
  const days: KitchenDay<Id>[] = [];
  for (const date of input.dates) {
    if (input.daysOff.has(date)) continue;
    const candidates = input.people.filter((person) => canDoKitchen(person, date, false));
    if (candidates.length === 0) {
      const workday = input.people.some((p) => regularMinutesOn(p.schedules, date) > 0);
      if (workday) days.push({ date, userId: null, candidates: [] });
      continue;
    }
    const kept = candidates.find((person) => person.userId === input.existing.get(date));
    const chosen =
      kept ??
      candidates.reduce((best, person) =>
        (last.get(person.userId) ?? "") < (last.get(best.userId) ?? "") ? person : best,
      );
    last.set(chosen.userId, date);
    days.push({
      date,
      userId: chosen.userId,
      candidates: candidates.map((person) => person.userId),
    });
  }
  return days;
}
