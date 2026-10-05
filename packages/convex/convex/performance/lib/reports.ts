import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import {
  addForecast,
  aggregateReasons,
  enrich,
  missingCallDays,
  monthBounds,
  sumTeam,
  type BadgeResult,
  type Snapshot,
} from "./kpi";
import { MAX_PLAUSIBLE_DAY_SECONDS } from "./callImport";
import { EXCLUDED_OWNERS } from "./salesforceImport";
import { DAILY_KEYS, METRIC_KEYS } from "./types";
import { parseISODate, todayBerlin } from "./workdays";

// ------------------------------------------------------------------ helpers

/** `teamTotals` and everything it transitively reads are also called from
 * `cacheCompletedMonthBadges` (a mutation, backfilling the badge cache
 * below) as well as every query in this file — widened to accept either
 * context since both only ever read through it. */
export type Ctx = QueryCtx | MutationCtx;

/** Whether a report name counts on the dashboard at all: not one of the
 * import's excluded owners and not hidden by an admin (Performance →
 * Einstellungen, `performanceEmployees.active`). */
export function countsOnDashboard(
  e: Pick<Doc<"performanceEmployees">, "name" | "active">,
): boolean {
  return e.active && !EXCLUDED_OWNERS.has(e.name.toLowerCase());
}

/** The dashboard's counted employees — the one place that decides who shows
 * up in team tables, totals, badges, marks and drill-downs. `ownerKeys`
 * holds the lowercased names for the tables keyed by the Salesforce owner
 * name instead of an employee id (raw leads/opps, won opps). */
export interface Roster {
  names: Map<Id<"performanceEmployees">, string>;
  ownerKeys: Set<string>;
}

export async function loadRoster(
  ctx: Ctx,
  companyId: Id<"companies">,
  cache?: QueryCache,
): Promise<Roster> {
  const hit = cache?.roster.get(companyId);
  if (hit) return hit;
  const employees = await ctx.db
    .query("performanceEmployees")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  const counted = employees.filter(countsOnDashboard);
  const roster: Roster = {
    names: new Map(counted.map((e) => [e._id, e.name])),
    ownerKeys: new Set(counted.map((e) => e.name.trim().toLowerCase())),
  };
  cache?.roster.set(companyId, roster);
  return roster;
}

export async function employeeNameMap(
  ctx: Ctx,
  companyId: Id<"companies">,
  cache?: QueryCache,
): Promise<Map<Id<"performanceEmployees">, string>> {
  return (await loadRoster(ctx, companyId, cache)).names;
}

export function reportToSnapshot(r: Doc<"performanceReports">, name: string): Snapshot {
  const snap: Snapshot = {
    employeeId: r.employeeId,
    name,
    reportDate: r.reportDate,
    unqualifiedReasons: r.unqualifiedReasons,
  };
  for (const k of METRIC_KEYS) {
    const v = r[k];
    if (v !== undefined) snap[k] = v;
  }
  return snap;
}

/**
 * Per-request memoization: `teamDashboard`/`employeeDetail` each ask for the
 * same (ym, employeeId) report range several times over via different helper
 * paths (team totals, call days, badge history, …), and — unlike Convex's
 * subscriber-level dedup, which only avoids redundant work *between*
 * clients — nothing dedupes repeats *within* one query execution. A query
 * handler never observes writes from other requests mid-execution, so
 * caching by key for the life of one call is exact, not approximate.
 */
export interface QueryCache {
  reports: Map<string, Doc<"performanceReports">[]>;
  roster: Map<Id<"companies">, Roster>;
  badges?: Record<string, Record<string, BadgeResult>>;
}

export function newQueryCache(): QueryCache {
  return { reports: new Map(), roster: new Map() };
}

export async function reportsInRange(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache,
): Promise<Doc<"performanceReports">[]> {
  const key = `${ym}:${employeeId ?? ""}`;
  const hit = cache.reports.get(key);
  if (hit) return hit;

  const { start, end } = monthBounds(ym);
  const rows = employeeId
    ? await ctx.db
        .query("performanceReports")
        .withIndex("by_employee_date", (q) =>
          q.eq("employeeId", employeeId).gte("reportDate", start).lte("reportDate", end),
        )
        .collect()
    : await ctx.db
        .query("performanceReports")
        .withIndex("by_company_reportDate", (q) =>
          q.eq("companyId", companyId).gte("reportDate", start).lte("reportDate", end),
        )
        .collect();
  cache.reports.set(key, rows);
  return rows;
}

/** Merges `next` onto `base`, keeping `base`'s value for any field `next`
 * didn't measure. A plain `{...base, ...next}` spread is unsafe here:
 * `reportToSnapshot` always sets `unqualifiedReasons` as an own key (even
 * when `undefined`), so a later row without a Lead report would spread an
 * explicit `undefined` over an earlier real value instead of leaving it
 * alone. */
export function mergeSnapshot(base: Snapshot, next: Snapshot): Snapshot {
  const merged = { ...base } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined) merged[k] = v;
  }
  return merged as unknown as Snapshot;
}

/** Latest report per employee within the month — "Monatswert = jüngster
 * Snapshot des Mitarbeiters in diesem Monat", per-field. `performanceReports`
 * is one row per report *date*, and each import only writes the fields its
 * source file actually measured (see the schema comment: undefined means
 * "not measured this snapshot", not zero) — a Lead/Opp report and a call
 * report for the same employee routinely land on different dates within the
 * same month. Taking a single newest-dated row wholesale would let a
 * call-only import (which never touches leadsCreated/workableCreated/etc.)
 * blank out an earlier Lead/Opp import's month-to-date totals the moment its
 * date becomes the newest — those totals are still sitting untouched in the
 * older row, just no longer surfaced. Folding every row in ascending-date
 * order (each row's *measured* fields override the running merge; anything
 * it left unmeasured carries forward) reconstructs the true "latest known
 * value per field" instead. */
export async function latestSnapshots(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache,
): Promise<Snapshot[]> {
  const names = await employeeNameMap(ctx, companyId, cache);
  const rows = await reportsInRange(ctx, companyId, ym, employeeId, cache);
  const sorted = [...rows].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const merged = new Map<Id<"performanceEmployees">, Snapshot>();
  for (const r of sorted) {
    if (!names.has(r.employeeId)) continue;
    const snap = reportToSnapshot(r, names.get(r.employeeId)!);
    const cur = merged.get(r.employeeId);
    merged.set(r.employeeId, cur ? mergeSnapshot(cur, snap) : snap);
  }
  const snaps = [...merged.values()];
  snaps.sort((a, b) => a.name.localeCompare(b.name));
  return snaps;
}

export const DAILY_DURATION_KEYS = new Set<(typeof DAILY_KEYS)[number]>([
  "talkTotalSec",
  "loginSec",
]);

/** A single employee's single-day duration can't plausibly exceed 24h (see
 * callImport.ts's MAX_PLAUSIBLE_DAY_SECONDS). Guards the team/day sums below
 * against a bad historical row — imported before the parser caught this, or
 * edited by hand — blowing up an otherwise-normal day's or month's total. */
export function plausibleDailyValue(
  key: (typeof DAILY_KEYS)[number],
  v: number,
): number | undefined {
  return DAILY_DURATION_KEYS.has(key) && v > MAX_PLAUSIBLE_DAY_SECONDS ? undefined : v;
}

export interface MonthCalls extends Partial<Record<(typeof DAILY_KEYS)[number], number>> {
  talkAvgSec?: number;
  nDays: number;
  workDays: number;
}

/** Call metrics summed over the month per employee — day-values, so they're
 * summed across report days rather than read as a latest snapshot. The
 * average call duration is weighted (total talk time / total calls), not
 * an average of daily averages, which would be skewed by uneven call
 * counts. */
export async function monthCallsMap(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache,
): Promise<Map<Id<"performanceEmployees">, MonthCalls>> {
  const names = await employeeNameMap(ctx, companyId, cache);
  const rows = await reportsInRange(ctx, companyId, ym, employeeId, cache);
  const sums = new Map<
    Id<"performanceEmployees">,
    {
      vals: Partial<Record<(typeof DAILY_KEYS)[number], number>>;
      nDays: number;
      workDays: number;
    }
  >();
  for (const r of rows) {
    if (!names.has(r.employeeId)) continue;
    const cur = sums.get(r.employeeId) ?? { vals: {}, nDays: 0, workDays: 0 };
    cur.nDays++;
    if ((r.callsToday ?? 0) > 0) cur.workDays++;
    for (const k of DAILY_KEYS) {
      const v = r[k];
      if (v === undefined) continue;
      const safe = plausibleDailyValue(k, v);
      if (safe !== undefined) cur.vals[k] = (cur.vals[k] ?? 0) + safe;
    }
    sums.set(r.employeeId, cur);
  }
  const out = new Map<Id<"performanceEmployees">, MonthCalls>();
  for (const [id, { vals, nDays, workDays }] of sums) {
    const calls = vals.callsToday ?? 0;
    out.set(id, {
      ...vals,
      talkAvgSec: vals.talkTotalSec && calls ? Math.round(vals.talkTotalSec / calls) : undefined,
      nDays,
      workDays,
    });
  }
  return out;
}

/** Report dates in the month that have `callsToday` measured at all — the
 * basis for telling "nobody reported this day" apart from "this employee
 * had the day off". */
export async function reportDatesWithCalls(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  cache: QueryCache,
): Promise<Set<string>> {
  const rows = await reportsInRange(ctx, companyId, ym, undefined, cache);
  return new Set(rows.filter((r) => r.callsToday !== undefined).map((r) => r.reportDate));
}

export interface TeamTotals {
  total: Snapshot;
  snaps: Snapshot[];
  unqualified: { reason: string; count: number }[];
}

/** Team KPI total for the month, and every employee's snapshot with call
 * metrics folded in (the "latest snapshot" only carries that one day's
 * daily values — the display values are the month-summed ones) and the
 * FC1 forecast added. */
export async function teamTotals(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  cache: QueryCache = newQueryCache(),
): Promise<TeamTotals> {
  const rawSnaps = await latestSnapshots(ctx, companyId, ym, undefined, cache);
  const calls = await monthCallsMap(ctx, companyId, ym, undefined, cache);
  const withCalls = rawSnaps.map((s) => {
    const c = calls.get(s.employeeId as Id<"performanceEmployees">);
    const next: Snapshot = { ...s };
    for (const k of DAILY_KEYS) next[k] = c?.[k];
    next.talkAvgSec = c?.talkAvgSec;
    return next;
  });

  let total = sumTeam(withCalls);
  const unqualified = aggregateReasons(withCalls.map((s) => s.unqualifiedReasons));
  total = addForecast(total, ym); // team: workday basis

  const asOf = total.reportDate ? parseISODate(total.reportDate) : todayBerlin();
  const present =
    calls.size > 0 ? await reportDatesWithCalls(ctx, companyId, ym, cache) : undefined;
  const missing = present ? missingCallDays(ym, asOf, present) : undefined;

  const snaps = withCalls.map((s) =>
    addForecast(
      enrich(s),
      ym,
      calls.get(s.employeeId as Id<"performanceEmployees">)?.workDays,
      missing,
    ),
  );

  return { total, snaps, unqualified };
}
