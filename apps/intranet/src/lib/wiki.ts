/**
 * Pure helpers for the wiki v2 (categories + entries) list/detail UI — kept
 * separate from the Convex functions so "is this expired / due for review"
 * stays derived (never stored) and every view computes it the same way.
 */

export const MAX_PINS = 5;
export const REVIEW_WINDOW_DAYS = 7;

export interface WikiEntryLike {
  validUntil: number;
  categoryDeleted: boolean;
}

export function daysUntil(ms: number, now = Date.now()): number {
  return Math.floor((ms - now) / 86400000);
}

export function isExpired(entry: WikiEntryLike, now = Date.now()): boolean {
  return daysUntil(entry.validUntil, now) < 0;
}

/** True once its category was deleted, or it's expired — either way it
 * belongs in the archive view rather than the normal list. */
export function inArchive(entry: WikiEntryLike, now = Date.now()): boolean {
  return entry.categoryDeleted || isExpired(entry, now);
}

/** Within the review window (or already past due) — surfaced in the
 * "needs review" panel regardless of whether it's also archived. */
export function needsReview(entry: WikiEntryLike, now = Date.now()): boolean {
  return daysUntil(entry.validUntil, now) <= REVIEW_WINDOW_DAYS;
}

export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "eintrag"
  );
}

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** `<input type="date">` uses local calendar dates — format by local Y/M/D
 * components rather than `toISOString()` (UTC), which would shift the
 * displayed date by a day for anyone east of UTC. */
export function msToDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
