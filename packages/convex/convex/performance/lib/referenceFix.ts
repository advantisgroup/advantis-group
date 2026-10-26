/**
 * VM/VJ against a reference month whose Salesforce reports have gaps.
 *
 * The like-for-like comparison cuts the reference month at the same
 * workday (`comparisonCutoff`) and takes each employee's newest snapshot up
 * to that day. When no lead/opp report was uploaded around that day (09/2026:
 * only 01.09. and 15.09.), that snapshot is weeks older than the cutoff and
 * every delta looks far too good. Such a reference is "stale": its stock
 * figures (Analysis, open opps …) can't be compared at all, and the monthly
 * counters are recounted from the dates in the newest reports instead —
 * leads by create date (`performanceLeadDays`), Closed Won by close date
 * (`performanceWonOpps`).
 *
 * Pure functions only; the queries load the data.
 */
import { rate, type Snapshot } from "./kpi";
import { isWorkday, parseISODate, toISODate } from "./workdays";

/** A reference snapshot this many workdays older than its cutoff still
 * counts as "the same point" (a missed upload or two). */
export const STALE_AFTER_WORKDAYS = 2;

/** Workdays after `from` up to and including `to`. */
export function workdaysAfter(from: string, to: string): number {
  let n = 0;
  for (
    let d = new Date(parseISODate(from).getTime() + 86_400_000);
    toISODate(d) <= to;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    if (isWorkday(d)) n++;
  }
  return n;
}

/** Whether the Salesforce figures behind a cut reference (`asOf`) are too
 * old for its `cutoff`. No cutoff (a full month) is never stale. */
export function isStale(cutoff: string | undefined, asOf: string | null | undefined): boolean {
  if (!cutoff) return false;
  if (!asOf) return true;
  return workdaysAfter(asOf, cutoff) > STALE_AFTER_WORKDAYS;
}

/** Salesforce figures that are a level on the report day, not a monthly
 * count — not comparable without a report from that day. */
export const SALES_STATE_KEYS = [
  "leadsAnalysis",
  "leadsDetailsIdent",
  "oppsOpen",
  "oppsClose7d",
  "oppsPending",
  "overduesAnalysis",
  "overduesOpps",
  "oppsOver30",
  "leadsNoAction14",
  "oppsNoAction14",
  "overduesSum",
] as const;

/** Monthly Salesforce counters that can be recounted from dates. */
export interface ExactCounts {
  leadsCreated?: number;
  workableCreated?: number;
  wonMonth?: number;
}

/** Counts up to the cutoff, and for the whole month to check them against
 * the month's own snapshot. */
export interface DatedCounts {
  cut: number;
  month: number;
}

/** Whether a recount from dates matches the month's snapshot closely
 * enough to trust it — a report filtered to fewer months, or names that
 * don't match, would make it too small. */
export function matchesMonth(counts: DatedCounts, monthValue: number | undefined): boolean {
  if (monthValue === undefined) return false;
  return Math.abs(counts.month - monthValue) <= Math.max(2, monthValue * 0.02);
}

/**
 * The stale reference with its Salesforce figures replaced: stock figures
 * dropped, counters from `exact` (or dropped when they couldn't be
 * recounted), rates and Won/day derived from those. `days` is the divisor
 * for Won/day up to the cutoff (workdays, or the employee's worked days).
 * Call figures stay as they are — they have their own cutoff.
 */
export function patchStaleReference(cut: Snapshot, exact: ExactCounts, days: number): Snapshot {
  const next: Snapshot = { ...cut };
  for (const k of SALES_STATE_KEYS) next[k] = undefined;
  next.leadsCreated = exact.leadsCreated;
  next.workableCreated = exact.workableCreated;
  next.wonMonth = exact.wonMonth;
  next.workableRate = rate(next.workableCreated, next.leadsCreated);
  next.hitrate = rate(next.wonMonth, next.workableCreated);
  next.wonPerDay =
    next.wonMonth !== undefined && days > 0
      ? Math.round((next.wonMonth / days) * 100) / 100
      : undefined;
  return next;
}
