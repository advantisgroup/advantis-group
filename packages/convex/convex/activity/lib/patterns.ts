/**
 * Weekly pattern-detection engine for ActivityTrack's per-employee reports.
 *
 * Deterministic and dependency-free by design (mirrors `lib/state.ts`): given
 * a week of fused `stateSamples`, it derives contiguous state segments, rolls
 * them up into metrics, and turns rule thresholds into "findings" — plain
 * data (a locale key + named, tone-tagged values), not rendered text, so the
 * UI can localize and colour-highlight them. No raw event data leaves this
 * module; only the aggregates and the findings do.
 */

export type StateName =
  | "ABSENT"
  | "CLOCKED_OUT"
  | "BREAK"
  | "IN_CALL"
  | "WRAP_UP"
  | "ACTIVE"
  | "IDLE";

export interface StateSample {
  state: StateName;
  at: number;
}

export interface StateSegment {
  state: StateName;
  start: number;
  end: number;
}

export function isWorkingState(state: StateName): boolean {
  return state === "ACTIVE" || state === "IN_CALL" || state === "WRAP_UP";
}

/**
 * Contiguous state runs across `[windowStart, windowEnd]`. `samples` must be
 * ascending by `at`; each on-change row holds until the next one (or
 * `windowEnd` for the last). Adjacent same-state runs are merged. Same shape
 * as the dashboard's `dayStateSegments` (apps/intranet/src/lib/activity/
 * activity.ts), reimplemented here since Convex functions can't import from
 * the Next.js app.
 */
export function buildSegments(
  samples: StateSample[],
  windowStart: number,
  windowEnd: number
): StateSegment[] {
  const segments: StateSegment[] = [];
  if (samples.length === 0 || windowEnd <= windowStart) return segments;

  for (let i = 0; i < samples.length; i++) {
    const start = Math.max(samples[i]!.at, windowStart);
    const rawEnd = i + 1 < samples.length ? samples[i + 1]!.at : windowEnd;
    const end = Math.min(rawEnd, windowEnd);
    if (end <= start) continue;

    const last = segments[segments.length - 1];
    if (last && last.state === samples[i]!.state && last.end === start) {
      last.end = end;
    } else {
      segments.push({ state: samples[i]!.state, start, end });
    }
  }
  return segments;
}

/** A short ACTIVE-ish blip sandwiched in IDLE, or vice versa — the "flicker"
 * pattern ("switching between inactive and active a lot under 10 minutes"). */
export function countQuickFlips(
  segments: StateSegment[],
  thresholdMs: number
): number {
  let count = 0;
  for (let i = 1; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (seg.end - seg.start >= thresholdMs) continue;

    const prev = segments[i - 1]!;
    const next = segments[i + 1]!;
    const segWorking = isWorkingState(seg.state);
    const flankingIsRelevant = (s: StateSegment) =>
      s.state === "IDLE" || isWorkingState(s.state);
    if (!flankingIsRelevant(prev) || !flankingIsRelevant(next)) continue;

    const idleBlip =
      seg.state === "IDLE" &&
      isWorkingState(prev.state) &&
      isWorkingState(next.state);
    const activeBlip =
      segWorking && prev.state === "IDLE" && next.state === "IDLE";
    if (idleBlip || activeBlip) count++;
  }
  return count;
}

export interface WeekMetrics {
  activeSeconds: number;
  idleSeconds: number;
  quickFlipCount: number;
  longestIdleStreakSeconds: number;
}

const MS_PER_SECOND = 1000;

export function computeWeekMetrics(
  segments: StateSegment[],
  quickFlipThresholdMs: number
): WeekMetrics {
  let activeMs = 0;
  let idleMs = 0;
  let longestIdleMs = 0;
  for (const seg of segments) {
    const dur = seg.end - seg.start;
    if (isWorkingState(seg.state)) activeMs += dur;
    else if (seg.state === "IDLE") {
      idleMs += dur;
      if (dur > longestIdleMs) longestIdleMs = dur;
    }
  }
  return {
    activeSeconds: Math.round(activeMs / MS_PER_SECOND),
    idleSeconds: Math.round(idleMs / MS_PER_SECOND),
    quickFlipCount: countQuickFlips(segments, quickFlipThresholdMs),
    longestIdleStreakSeconds: Math.round(longestIdleMs / MS_PER_SECOND),
  };
}

/** Monday (ISO week start) as YYYY-MM-DD for a given YYYY-MM-DD day. */
export function weekStartOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDaysToDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayToMs(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime();
}

export type FindingSeverity = "good" | "bad" | "neutral";
export type FindingTone = "ok" | "warn" | "info" | "muted" | "fg";
export type FindingFormat = "duration" | "percent" | "count";

export interface FindingValue {
  name: string;
  value: string | number;
  format?: FindingFormat;
  tone?: FindingTone;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  key: string;
  values: FindingValue[];
}

/** Thresholds tuning when a rule fires — kept together so they're easy to
 * retune without hunting through the rule bodies. */
export const PATTERN_THRESHOLDS = {
  /** A flip shorter than this counts as a "quick" active↔idle flicker. */
  quickFlipMs: 10 * 60 * 1000,
  /** This many quick flips (or more) in a week is "a lot". */
  quickFlipBadCount: 5,
  /** A single idle stretch at least this long is worth flagging. */
  longIdleStreakMs: 45 * 60 * 1000,
  /** Week-over-week change below this magnitude reads as "about the same". */
  notableDeltaPct: 15,
} as const;

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Rule-based findings for one employee's week. `previous` is the prior week's
 * metrics (undefined when there isn't a full prior week of data yet, e.g. a
 * newly tracked employee). Order is deliberate: the overview line always
 * leads, then notable changes, worst first.
 */
export function buildFindings(
  personName: string,
  current: WeekMetrics,
  previous: WeekMetrics | undefined
): Finding[] {
  const findings: Finding[] = [];
  const trackedSeconds = current.activeSeconds + current.idleSeconds;
  const activeSharePct =
    trackedSeconds > 0
      ? Math.round((current.activeSeconds / trackedSeconds) * 100)
      : 0;

  findings.push({
    id: "overview",
    severity: "neutral",
    key: "pattern.overview",
    values: [
      { name: "name", value: personName },
      { name: "activeShare", value: activeSharePct, format: "percent" },
      {
        name: "active",
        value: current.activeSeconds,
        format: "duration",
        tone: "ok",
      },
      {
        name: "idle",
        value: current.idleSeconds,
        format: "duration",
        tone: "warn",
      },
    ],
  });

  if (current.quickFlipCount >= PATTERN_THRESHOLDS.quickFlipBadCount) {
    findings.push({
      id: "quickFlips",
      severity: "bad",
      key: "pattern.quickFlips",
      values: [
        {
          name: "count",
          value: current.quickFlipCount,
          format: "count",
          tone: "warn",
        },
        {
          name: "threshold",
          value: Math.round(PATTERN_THRESHOLDS.quickFlipMs / MS_PER_SECOND),
          format: "duration",
          tone: "muted",
        },
      ],
    });
  }

  if (
    current.longestIdleStreakSeconds * MS_PER_SECOND >=
    PATTERN_THRESHOLDS.longIdleStreakMs
  ) {
    findings.push({
      id: "longIdleStreak",
      severity: "bad",
      key: "pattern.longIdleStreak",
      values: [
        {
          name: "duration",
          value: current.longestIdleStreakSeconds,
          format: "duration",
          tone: "warn",
        },
      ],
    });
  }

  if (!previous) {
    findings.push({
      id: "noBaseline",
      severity: "neutral",
      key: "pattern.noBaseline",
      values: [{ name: "name", value: personName }],
    });
    return findings;
  }

  const idleDeltaPct = pctDelta(current.idleSeconds, previous.idleSeconds);
  const activeDeltaPct = pctDelta(
    current.activeSeconds,
    previous.activeSeconds
  );

  if (
    idleDeltaPct !== null &&
    idleDeltaPct >= PATTERN_THRESHOLDS.notableDeltaPct
  ) {
    findings.push({
      id: "inactivityIncrease",
      severity: "bad",
      key: "pattern.inactivityIncrease",
      values: [
        {
          name: "deltaPct",
          value: idleDeltaPct,
          format: "percent",
          tone: "warn",
        },
        {
          name: "prevIdle",
          value: previous.idleSeconds,
          format: "duration",
          tone: "muted",
        },
        {
          name: "idle",
          value: current.idleSeconds,
          format: "duration",
          tone: "warn",
        },
      ],
    });
  } else if (
    idleDeltaPct !== null &&
    idleDeltaPct <= -PATTERN_THRESHOLDS.notableDeltaPct
  ) {
    findings.push({
      id: "inactivityDecrease",
      severity: "good",
      key: "pattern.inactivityDecrease",
      values: [
        {
          name: "deltaPct",
          value: Math.abs(idleDeltaPct),
          format: "percent",
          tone: "ok",
        },
        {
          name: "prevIdle",
          value: previous.idleSeconds,
          format: "duration",
          tone: "muted",
        },
        {
          name: "idle",
          value: current.idleSeconds,
          format: "duration",
          tone: "ok",
        },
      ],
    });
  }

  if (
    activeDeltaPct !== null &&
    activeDeltaPct >= PATTERN_THRESHOLDS.notableDeltaPct
  ) {
    findings.push({
      id: "activeIncrease",
      severity: "good",
      key: "pattern.activeIncrease",
      values: [
        {
          name: "deltaPct",
          value: activeDeltaPct,
          format: "percent",
          tone: "ok",
        },
        {
          name: "active",
          value: current.activeSeconds,
          format: "duration",
          tone: "ok",
        },
        {
          name: "prevActive",
          value: previous.activeSeconds,
          format: "duration",
          tone: "muted",
        },
      ],
    });
  } else if (
    activeDeltaPct !== null &&
    activeDeltaPct <= -PATTERN_THRESHOLDS.notableDeltaPct
  ) {
    findings.push({
      id: "activeDecrease",
      severity: "bad",
      key: "pattern.activeDecrease",
      values: [
        {
          name: "deltaPct",
          value: Math.abs(activeDeltaPct),
          format: "percent",
          tone: "warn",
        },
        {
          name: "active",
          value: current.activeSeconds,
          format: "duration",
          tone: "warn",
        },
        {
          name: "prevActive",
          value: previous.activeSeconds,
          format: "duration",
          tone: "muted",
        },
      ],
    });
  }

  // Nothing notable beyond the always-present overview line — say so
  // explicitly rather than leaving the report looking incomplete.
  if (findings.length === 1) {
    findings.push({
      id: "steady",
      severity: "good",
      key: "pattern.steady",
      values: [],
    });
  }

  return findings;
}
