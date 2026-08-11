/**
 * Pure reconstruction of what Clockodo says happened during one day, from a
 * deep (whole-day) entries fetch — used by the "Deep sanitize" troubleshooting
 * button to correct history that was written under the old UTC-day bug, or
 * that drifted because a Clockodo entry was edited/deleted after the fact.
 *
 * Unlike the live poll (which only asserts "what's true right now"), this
 * walks the day's *entries* in order and emits one segment per Clockodo-owned
 * state change: ABSENT for an approved absence, CLOCKED_OUT for a gap long
 * enough to read as the day being over, BREAK for a shorter gap, and WORKING
 * for the entry itself. WORKING is deliberately not a final `EmployeeState` —
 * Clockodo has no opinion on ACTIVE vs IN_CALL vs WRAP_UP during a clocked-in
 * stretch, so the caller decides what (if anything) to do with it.
 */

export interface ClockodoEntryWindow {
  /** Epoch ms; entries with no parseable start are filtered out by the caller. */
  start: number;
  /** Epoch ms, or null while still running. */
  end: number | null;
}

export type ClockodoDayKind = "ABSENT" | "CLOCKED_OUT" | "BREAK" | "WORKING";

export interface ClockodoDaySegment {
  at: number;
  kind: ClockodoDayKind;
}

export interface DeriveClockodoDaySegmentsArgs {
  /** Sorted ascending by `start`. */
  entries: ClockodoEntryWindow[];
  absentWholeDay: boolean;
  /** Local-midnight instant (epoch ms) of the day being reconstructed. */
  dayStartMs: number;
  /** End of the window being asserted — the day's end, or `now` if that day
   * isn't over yet. Never assert anything past this. */
  capMs: number;
  /** Same threshold the live poller uses (`ASSUMED_CLOCKED_OUT_AFTER_MS`). */
  assumedClockedOutAfterMs: number;
  /** Whether `capMs` is at/after the business day-end hour (or the day is
   * simply in the past) — gaps become CLOCKED_OUT outright instead of the
   * "assumed" heuristic. */
  isPastDayEnd: boolean;
}

/** One CLOCKED_OUT/BREAK verdict for a gap of `gapMs` ending at `capMs`. */
function gapKind(
  gapMs: number,
  assumedClockedOutAfterMs: number,
  isPastDayEnd: boolean,
): "CLOCKED_OUT" | "BREAK" {
  return gapMs > assumedClockedOutAfterMs || isPastDayEnd ? "CLOCKED_OUT" : "BREAK";
}

export function deriveClockodoDaySegments({
  entries,
  absentWholeDay,
  dayStartMs,
  capMs,
  assumedClockedOutAfterMs,
  isPastDayEnd,
}: DeriveClockodoDaySegmentsArgs): ClockodoDaySegment[] {
  if (absentWholeDay) return [{ at: dayStartMs, kind: "ABSENT" }];
  if (capMs <= dayStartMs) return [];

  const segments: ClockodoDaySegment[] = [];
  let cursor = dayStartMs;

  for (const entry of entries) {
    const start = Math.max(entry.start, dayStartMs);
    if (start >= capMs) break;
    if (start > cursor) {
      segments.push({
        at: cursor,
        kind: gapKind(start - cursor, assumedClockedOutAfterMs, isPastDayEnd),
      });
    }
    segments.push({ at: start, kind: "WORKING" });
    cursor = entry.end != null ? Math.min(entry.end, capMs) : capMs;
    if (cursor >= capMs) break;
  }

  if (cursor < capMs) {
    segments.push({
      at: cursor,
      kind: gapKind(capMs - cursor, assumedClockedOutAfterMs, isPastDayEnd),
    });
  }

  // Collapse consecutive duplicate kinds (a WORKING entry immediately
  // followed by another WORKING entry after a zero-length gap, etc.) so the
  // caller doesn't write redundant same-state samples back to back.
  return segments.filter((seg, i) => i === 0 || seg.kind !== segments[i - 1]!.kind);
}
