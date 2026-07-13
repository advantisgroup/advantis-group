/**
 * `users.clockodoUserId` (number) and `people.clockodoUserId` (string) store
 * the same real-world Clockodo id in two different types — a pre-existing
 * mismatch documented on `people` in `schema.ts`. `users.clockodoUserId` is
 * canonical; `people.clockodoUserId` is a mirror kept only because
 * ActivityTrack's poller reads the roster row directly. Use these helpers at
 * every boundary that reads or compares the two rather than re-deriving the
 * conversion inline.
 */

export function toClockodoIdString(clockodoUserId: number): string {
  return String(clockodoUserId);
}

export function toClockodoIdNumber(clockodoUserId: string): number | null {
  const n = Number(clockodoUserId);
  return Number.isFinite(n) ? n : null;
}
