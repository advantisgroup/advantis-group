/**
 * Clockodo user ids arrive as numbers from Clockodo's API but are stored as
 * strings (`users.clockodoUserId`, and the legacy ActivityTrack
 * `people.clockodoUserId`). Use these helpers at every boundary that reads
 * or compares the two rather than re-deriving the conversion inline.
 */

export function toClockodoIdString(clockodoUserId: number): string {
  return String(clockodoUserId);
}

export function toClockodoIdNumber(clockodoUserId: string): number | null {
  const n = Number(clockodoUserId);
  return Number.isFinite(n) ? n : null;
}
