import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import {
  addForecast,
  aggregateReasons,
  callCoverage,
  enrich,
  monthBounds,
  monthCompleted,
  sumTeam,
  type BadgeResult,
  type CallCoverage,
  type Snapshot,
} from "./kpi";
import { MAX_PLAUSIBLE_DAY_SECONDS } from "./callImport";
import { EXCLUDED_OWNERS } from "./salesforceImport";
import { DAILY_KEYS, METRIC_KEYS, type MetricFields } from "./types";

/** Everything here only reads, and is called from queries as well as the
 * badge-cache cron (a mutation). */
export type Ctx = QueryCtx | MutationCtx;

type EmployeeId = Id<"performanceEmployees">;
type DailyKey = (typeof DAILY_KEYS)[number];

/** The fields of a `performanceReports` row the KPI math reads. */
export type ReportRow = Pick<
  Doc<"performanceReports">,
  "employeeId" | "reportDate" | "unqualifiedReasons"
> &
  Partial<MetricFields>;

// ------------------------------------------------------------------- roster

/** Whether a report name counts on the dashboard at all: not one of the
 * import's excluded owners and not hidden by an admin (Performance →
 * Einstellungen, `performanceEmployees.active`). */
export function countsOnDashboard(
  e: Pick<Doc<"performanceEmployees">, "name" | "active">,
): boolean {
  return e.active && !EXCLUDED_OWNERS.has(e.name.toLowerCase());
}

/** Whether the dashboard counts only report names linked to an intranet
 * person (`companies.teamOnly`, on unless switched off). */
export function teamOnly(company: Pick<Doc<"companies">, "teamOnly">): boolean {
  return company.teamOnly !== false;
}

/** The employees linked to an active intranet account — everyone else in a
 * shared export (partner firms like S2B, people who left) is not ours. */
export async function linkedToIntranet<T extends Pick<Doc<"performanceEmployees">, "userId">>(
  ctx: Ctx,
  employees: T[],
): Promise<T[]> {
  const users = await Promise.all(
    employees.map((e) => (e.userId ? ctx.db.get(e.userId) : Promise.resolve(null))),
  );
  return employees.filter((_, i) => users[i]?.status === "active");
}

/** The dashboard's counted employees — the one place that decides who shows
 * up in team tables, totals, badges, marks and drill-downs. `ownerKeys`
 * holds the lowercased names for the tables keyed by the Salesforce owner
 * name instead of an employee id (raw leads/opps, won opps). */
export interface Roster {
  names: Map<EmployeeId, string>;
  ownerKeys: Set<string>;
}

/**
 * Per-request memoization. A query never sees writes from other requests
 * while it runs, so caching for the life of one call is exact. Keys carry
 * the dashboard id because the badge cron walks several dashboards.
 */
export interface QueryCache {
  roster: Map<Id<"companies">, Roster>;
  rows: Map<string, Doc<"performanceReports">[]>;
  months: Map<string, MonthSummary>;
  badges?: Record<string, Record<string, BadgeResult>>;
}

export function newQueryCache(): QueryCache {
  return { roster: new Map(), rows: new Map(), months: new Map() };
}

export async function loadRoster(
  ctx: Ctx,
  companyId: Id<"companies">,
  cache?: QueryCache,
): Promise<Roster> {
  const hit = cache?.roster.get(companyId);
  if (hit) return hit;
  const [company, employees] = await Promise.all([
    ctx.db.get(companyId),
    ctx.db
      .query("performanceEmployees")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
  ]);
  let counted = employees.filter(countsOnDashboard);
  if (company && teamOnly(company)) counted = await linkedToIntranet(ctx, counted);
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
): Promise<Map<EmployeeId, string>> {
  return (await loadRoster(ctx, companyId, cache)).names;
}

/** Every report row of the dashboard in month `ym` (one indexed range read,
 * memoized). */
export async function monthRows(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  cache: QueryCache,
): Promise<Doc<"performanceReports">[]> {
  const key = `${companyId}:${ym}`;
  const hit = cache.rows.get(key);
  if (hit) return hit;
  const { start, end } = monthBounds(ym);
  const rows = await ctx.db
    .query("performanceReports")
    .withIndex("by_company_reportDate", (q) =>
      q.eq("companyId", companyId).gte("reportDate", start).lte("reportDate", end),
    )
    .collect();
  cache.rows.set(key, rows);
  return rows;
}

// ------------------------------------------------------------- snapshots

export function reportToSnapshot(r: ReportRow, name: string): Snapshot {
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

/** Merges `next` onto `base`, keeping `base`'s value for any field `next`
 * didn't measure (a plain spread would copy explicit `undefined`s over). */
export function mergeSnapshot(base: Snapshot, next: Snapshot): Snapshot {
  const merged = { ...base } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined) merged[k] = v;
  }
  return merged as unknown as Snapshot;
}

/** Latest known value per field and employee ("Monatswert = jüngster
 * Snapshot"). Each import only writes the fields its file measured, and a
 * Lead/Opp report and a call report routinely land on different dates — so
 * rows are folded oldest first, each measured field overriding, instead of
 * taking the newest row wholesale. Sorted by name. */
export function foldSnapshots(
  rows: readonly ReportRow[],
  names: ReadonlyMap<EmployeeId, string>,
): Snapshot[] {
  const sorted = [...rows].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const merged = new Map<EmployeeId, Snapshot>();
  for (const r of sorted) {
    const name = names.get(r.employeeId);
    if (name === undefined) continue;
    const snap = reportToSnapshot(r, name);
    const cur = merged.get(r.employeeId);
    merged.set(r.employeeId, cur ? mergeSnapshot(cur, snap) : snap);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const DAILY_DURATION_KEYS = new Set<DailyKey>(["talkTotalSec", "loginSec"]);

/** A single employee's single-day duration can't plausibly exceed 24h (see
 * callImport.ts's MAX_PLAUSIBLE_DAY_SECONDS). Guards the sums below against
 * a bad historical row blowing up an otherwise normal day or month. */
export function plausibleDailyValue(key: DailyKey, v: number): number | undefined {
  return DAILY_DURATION_KEYS.has(key) && v > MAX_PLAUSIBLE_DAY_SECONDS ? undefined : v;
}

export interface MonthCalls extends Partial<Record<DailyKey, number>> {
  talkAvgSec?: number;
  /** Days with at least one call — the employee's worked days. */
  workDays: number;
  /** Days with Genesys login time. */
  loginDays: number;
}

/** Call metrics summed over the month per employee (day values, so summed
 * rather than read as a snapshot). The average call duration is weighted
 * (talk time ÷ calls), not an average of daily averages. */
export function sumCalls(rows: readonly ReportRow[]): Map<EmployeeId, MonthCalls> {
  const sums = new Map<
    EmployeeId,
    { vals: Partial<Record<DailyKey, number>>; workDays: number; loginDays: number }
  >();
  for (const r of rows) {
    const cur = sums.get(r.employeeId) ?? { vals: {}, workDays: 0, loginDays: 0 };
    if ((r.callsToday ?? 0) > 0) cur.workDays++;
    if ((r.loginSec ?? 0) > 0) cur.loginDays++;
    for (const k of DAILY_KEYS) {
      const v = r[k];
      if (v === undefined) continue;
      const safe = plausibleDailyValue(k, v);
      if (safe !== undefined) cur.vals[k] = (cur.vals[k] ?? 0) + safe;
    }
    sums.set(r.employeeId, cur);
  }
  const out = new Map<EmployeeId, MonthCalls>();
  for (const [id, { vals, workDays, loginDays }] of sums) {
    const calls = vals.callsToday ?? 0;
    out.set(id, {
      ...vals,
      talkAvgSec: vals.talkTotalSec && calls ? Math.round(vals.talkTotalSec / calls) : undefined,
      workDays,
      loginDays,
    });
  }
  return out;
}

export interface MonthSummary {
  total: Snapshot;
  snaps: Snapshot[];
  unqualified: { reason: string; count: number }[];
  /** Which days the call reports cover; null when the month has none. */
  coverage: CallCoverage | null;
  /** Newest day with Salesforce figures / with call figures. */
  asOf: { sales: string | null; calls: string | null };
}

const DAILY_SET = new Set<string>(DAILY_KEYS);

/** Last day to count, separately for the Salesforce figures and the call
 * figures — they arrive on different days, so each is cut at its own
 * like-for-like point (see `comparisonCutoff`). */
export interface Cutoff {
  sales?: string;
  calls?: string;
}

/** Drops whatever a row measured after its source's cutoff. */
export function cutRows(rows: readonly ReportRow[], cutoff: Cutoff | undefined): ReportRow[] {
  if (!cutoff || (!cutoff.sales && !cutoff.calls)) return [...rows];
  const out: ReportRow[] = [];
  for (const r of rows) {
    const keepSales = !cutoff.sales || r.reportDate <= cutoff.sales;
    const keepCalls = !cutoff.calls || r.reportDate <= cutoff.calls;
    if (keepSales && keepCalls) {
      out.push(r);
      continue;
    }
    if (!keepSales && !keepCalls) continue;
    const next: ReportRow = { employeeId: r.employeeId, reportDate: r.reportDate };
    if (keepSales) next.unqualifiedReasons = r.unqualifiedReasons;
    for (const k of METRIC_KEYS) {
      if (r[k] !== undefined && DAILY_SET.has(k) === keepCalls) next[k] = r[k];
    }
    out.push(next);
  }
  return out;
}

function latestDates(rows: readonly ReportRow[]): MonthSummary["asOf"] {
  let sales: string | null = null;
  let calls: string | null = null;
  for (const r of rows) {
    if (r.callsToday !== undefined && (!calls || r.reportDate > calls)) calls = r.reportDate;
    if (sales && r.reportDate <= sales) continue;
    if (METRIC_KEYS.some((k) => !DAILY_SET.has(k) && r[k] !== undefined)) sales = r.reportDate;
  }
  return { sales, calls };
}

/**
 * A month's team total and per-employee snapshots, with call metrics summed
 * over the month and the FC1 forecast added.
 *
 * `cutoff` counts only rows up to that date (the "same point last month"
 * comparison). `coverage` overrides the call coverage worked out from
 * `rows` — `null` for "don't judge missing days" (an employee's own history,
 * where a day without their row may just be a day off).
 *
 * Workdays without any call report are counted as worked for everyone with
 * call data and flagged on the forecast: dropping them from the divisor
 * inflated FC1 whenever an upload was missing.
 */
export function summarizeMonth(
  rows: readonly ReportRow[],
  names: ReadonlyMap<EmployeeId, string>,
  ym: string,
  opts: { cutoff?: Cutoff; coverage?: CallCoverage | null; today?: Date } = {},
): MonthSummary {
  const counted = cutRows(
    rows.filter((r) => names.has(r.employeeId)),
    opts.cutoff,
  );
  const calls = sumCalls(counted);
  const withCalls = foldSnapshots(counted, names).map((s) => {
    const c = calls.get(s.employeeId as EmployeeId);
    const next: Snapshot = { ...s };
    for (const k of DAILY_KEYS) next[k] = c?.[k];
    next.talkAvgSec = c?.talkAvgSec;
    next.callDays = c?.workDays;
    next.loginDays = c?.loginDays;
    return next;
  });

  const teamRaw = sumTeam(withCalls);
  // A finished month (looked at whole, not cut) counts to its last day:
  // FC1 is then the actual result even if the last days had no upload.
  const complete = !opts.cutoff && monthCompleted(ym, opts.today);
  const monthEnd = monthBounds(ym).end;
  const coverage =
    opts.coverage !== undefined
      ? opts.coverage
      : callCoverage(counted, ym, teamRaw.reportDate, complete);
  const missing = coverage?.missing ?? [];
  const total = addForecast(teamRaw, ym, {
    missing,
    through: complete ? monthEnd : undefined,
  });

  const snaps = withCalls.map((s) => {
    const workDays = calls.get(s.employeeId as EmployeeId)?.workDays ?? 0;
    return addForecast(
      enrich(s),
      ym,
      workDays > 0
        ? {
            worked: workDays + missing.length,
            through: complete ? monthEnd : (coverage?.through ?? undefined),
            missing,
          }
        : { through: complete ? monthEnd : undefined },
    );
  });

  return {
    total,
    snaps,
    unqualified: aggregateReasons(withCalls.map((s) => s.unqualifiedReasons)),
    coverage,
    asOf: latestDates(counted),
  };
}

/** `summarizeMonth` over the dashboard's rows of `ym`, memoized. */
export async function teamTotals(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  cache: QueryCache = newQueryCache(),
  cutoff?: Cutoff,
): Promise<MonthSummary> {
  const key = `${companyId}:${ym}:${cutoff?.sales ?? ""}:${cutoff?.calls ?? ""}`;
  const hit = cache.months.get(key);
  if (hit) return hit;
  const roster = await loadRoster(ctx, companyId, cache);
  const rows = await monthRows(ctx, companyId, ym, cache);
  const summary = summarizeMonth(rows, roster.names, ym, { cutoff });
  cache.months.set(key, summary);
  return summary;
}

// ------------------------------------------------------------ day series

export interface CallDay {
  date: string;
  values: Partial<Record<DailyKey, number>>;
  /** Employees with Genesys login time that day. */
  loggedIn: number;
}

function monthDays(ym: string): string[] {
  const { start, end } = monthBounds(ym);
  const days: string[] = [];
  const [y, m] = ym.split("-").map(Number);
  const last = Number(end.slice(8));
  for (let d = Number(start.slice(8)); d <= last; d++) {
    days.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

/** Every calendar day of the month with that day's summed call metrics
 * (team-wide, or one employee) — the day-by-day charts. */
export function callDays(
  rows: readonly ReportRow[],
  names: ReadonlyMap<EmployeeId, string>,
  ym: string,
  employeeId?: EmployeeId,
): CallDay[] {
  const byDate = new Map<string, Partial<Record<DailyKey, number>>>();
  const loggedIn = new Map<string, number>();
  for (const r of rows) {
    if (!names.has(r.employeeId) || (employeeId && r.employeeId !== employeeId)) continue;
    const cur = byDate.get(r.reportDate) ?? {};
    for (const k of DAILY_KEYS) {
      const v = r[k];
      if (v === undefined) continue;
      const safe = plausibleDailyValue(k, v);
      if (safe !== undefined) cur[k] = (cur[k] ?? 0) + safe;
    }
    byDate.set(r.reportDate, cur);
    if ((r.loginSec ?? 0) > 0) loggedIn.set(r.reportDate, (loggedIn.get(r.reportDate) ?? 0) + 1);
  }
  return monthDays(ym).map((date) => ({
    date,
    values: byDate.get(date) ?? {},
    loggedIn: loggedIn.get(date) ?? 0,
  }));
}
