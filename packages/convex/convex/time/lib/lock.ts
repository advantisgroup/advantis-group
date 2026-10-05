import { addMonths, berlinInstant, berlinParts } from "./berlin";

export interface LockLike {
  lockedAt?: number;
  unlockedAt?: number;
}

/** When `month` (YYYY-MM) locks by itself: the 15th of the following month,
 *  00:00 Europe/Berlin. */
export function lockBoundary(month: string): number {
  return berlinInstant(`${addMonths(month, 1)}-15`, 0);
}

/**
 * A month is locked once its boundary passed or an admin locked it early,
 * unless an admin unlocked it since (the later of `lockedAt`/`unlockedAt`
 * wins; a lock at the same instant wins).
 */
export function isMonthLocked(month: string, now: number, row?: LockLike | null): boolean {
  if (row?.unlockedAt != null && row.unlockedAt > (row.lockedAt ?? 0)) return false;
  if (row?.lockedAt != null && row.lockedAt <= now) return true;
  return now >= lockBoundary(month);
}

/** The newest month whose boundary has passed at `now`. */
export function latestLockableMonth(now: number): string {
  const { year, month, day } = berlinParts(now);
  const current = `${year}-${String(month).padStart(2, "0")}`;
  return addMonths(current, day >= 15 ? -1 : -2);
}
