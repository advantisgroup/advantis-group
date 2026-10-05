/**
 * Read queries backing the Performance dashboards — team overview, employee
 * detail/history, and the KPI drill-down lists.
 *
 * Every query runs as the signed-in intranet user and goes through
 * `lib/access.ts`: admins see every dashboard, a team/department lead their
 * dashboard's team view, everyone else only their own employee page.
 *
 * Reads are kept to indexed ranges and memoized per request (`QueryCache`):
 * a month's report rows are read once and every figure of that month —
 * totals, call days, coverage, the like-for-like comparison cut — is
 * computed from them in memory (`lib/reports.ts`).
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { internalMutation, userQuery } from "../functions";
import { type QueryCtx } from "../_generated/server";
import {
  aggregateReasons,
  awardBadges,
  badgeCacheReady,
  badgeCacheStale,
  BADGES,
  comparisonCutoff,
  comparisonDeltas,
  computeTeamBenchmark,
  employeeSignals,
  hitrateMinBase,
  marksForMonth,
  monthBounds,
  monthCompleted,
  shiftYm,
  teamAverages,
  type BadgeResult,
  type Snapshot,
  type UploadStamp,
} from "./lib/kpi";
import { type MetricFields } from "./lib/types";
import { isWorkday, parseISODate, todayBerlin, toISODate, workdaysElapsed } from "./lib/workdays";
import {
  loadViewer,
  requireTeamView,
  requireViewableEmployee,
  resolveDashboard,
} from "./lib/access";
import {
  type CallDay,
  type Ctx,
  type Cutoff,
  type MonthSummary,
  type QueryCache,
  callDays,
  countsOnDashboard,
  employeeNameMap,
  loadRoster,
  monthRows,
  newQueryCache,
  summarizeMonth,
  teamTotals,
} from "./lib/reports";

/** The current month in Berlin. Inside a cached Convex query this only
 * moves on when the query re-runs, which is fine for a month boundary. */
function currentYm(): string {
  return toISODate(todayBerlin()).slice(0, 7);
}

/** The month a page opens on: the current one once it has data, before
 * that (the 1st, before the first upload) the previous one. */
function defaultYm(monthsWithData: readonly string[]): string {
  const current = currentYm();
  if (monthsWithData.includes(current)) return current;
  const previous = shiftYm(current, -1);
  return monthsWithData.includes(previous) ? previous : current;
}

function hasCallData(s: Snapshot | undefined): boolean {
  return !!(s?.callsToday || s?.talkTotalSec || s?.loginSec);
}

/** All months with at least one report of the dashboard, oldest first —
 * one indexed existence check per month between the first and the newest
 * report instead of reading every report ever imported. */
async function teamMonths(ctx: Ctx, companyId: Id<"companies">): Promise<string[]> {
  const earliest = await ctx.db
    .query("performanceReports")
    .withIndex("by_company_reportDate", (q) => q.eq("companyId", companyId))
    .order("asc")
    .first();
  if (!earliest) return [];
  const latest = await ctx.db
    .query("performanceReports")
    .withIndex("by_company_reportDate", (q) => q.eq("companyId", companyId))
    .order("desc")
    .first();

  const yms: string[] = [];
  const lastYm = latest!.reportDate.slice(0, 7);
  for (let ym = earliest.reportDate.slice(0, 7); ym <= lastYm; ym = shiftYm(ym, 1)) {
    const { start, end } = monthBounds(ym);
    const hit = await ctx.db
      .query("performanceReports")
      .withIndex("by_company_reportDate", (q) =>
        q.eq("companyId", companyId).gte("reportDate", start).lte("reportDate", end),
      )
      .first();
    if (hit) yms.push(ym);
  }
  return yms;
}

// ----------------------------------------------------------- comparisons

export interface ComparisonInfo {
  /** "sameWorkday": a running month against the reference months as they
   * stood after the same number of workdays. "full": a completed month,
   * full against full. */
  mode: "full" | "sameWorkday";
  /** Workdays of the shown month behind the comparison. */
  workday: number;
  /** Last day of the previous month / year counted (sales figures). */
  vmCutoff: string | null;
  vjCutoff: string | null;
}

interface Reference {
  cut: Snapshot | undefined;
  full: Snapshot | undefined;
  cutoff: Cutoff | undefined;
}

function cutoffFor(ym: string, refYm: string, asOf: MonthSummary["asOf"]): Cutoff | undefined {
  const sales = comparisonCutoff(ym, refYm, asOf.sales);
  const calls = comparisonCutoff(ym, refYm, asOf.calls ?? asOf.sales);
  return sales || calls ? { sales, calls } : undefined;
}

function comparisonInfo(
  ym: string,
  asOf: MonthSummary["asOf"],
  vm: Reference | undefined,
  vj: Reference | undefined,
): ComparisonInfo {
  const done = monthCompleted(ym);
  const latest = asOf.sales ?? asOf.calls;
  return {
    mode: done ? "full" : "sameWorkday",
    workday: workdaysElapsed(ym, latest ? parseISODate(latest) : todayBerlin()),
    vmCutoff: vm?.cutoff?.sales ?? null,
    vjCutoff: vj?.cutoff?.sales ?? null,
  };
}

/** The team's reference month, whole and cut at the like-for-like point. */
async function teamReference(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  ym: string,
  refYm: string,
  asOf: MonthSummary["asOf"],
  months: readonly string[],
  cache: QueryCache,
): Promise<Reference | undefined> {
  if (!months.includes(refYm)) return undefined;
  const full = (await teamTotals(ctx, companyId, refYm, cache)).total;
  const cutoff = cutoffFor(ym, refYm, asOf);
  if (!cutoff) return { cut: full, full, cutoff };
  const cut = (await teamTotals(ctx, companyId, refYm, cache, cutoff)).total;
  return { cut, full, cutoff };
}

// ------------------------------------------------------------ day series

export interface WonDay {
  date: string;
  won: number;
}

/** Daily Closed Won (team, or one employee) over the trailing 3 calendar
 * months ending with the actual current month, workdays only. Reads
 * `performanceWonOpps` (one row per opportunity at its real Close Date)
 * rather than diffing the cumulative `wonMonth` between uploads. Ignores the
 * selected month on purpose — it always shows "the last 3 months". */
async function closedWonTrend(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  employeeName: string | undefined,
  cache: QueryCache,
): Promise<{ days: WonDay[]; avg: number }> {
  const current = currentYm();
  const { start } = monthBounds(shiftYm(current, -2));
  const { end } = monthBounds(current);
  const rows = await ctx.db
    .query("performanceWonOpps")
    .withIndex("by_company_closeDate", (q) =>
      q.eq("companyId", companyId).gte("closeDate", start).lte("closeDate", end),
    )
    .collect();

  const { ownerKeys } = await loadRoster(ctx, companyId, cache);
  const only = employeeName?.trim().toLowerCase();
  const perDate = new Map<string, number>();
  for (const r of rows) {
    const key = r.owner.trim().toLowerCase();
    if (!ownerKeys.has(key) || (only !== undefined && key !== only)) continue;
    perDate.set(r.closeDate, (perDate.get(r.closeDate) ?? 0) + 1);
  }

  const today = toISODate(todayBerlin());
  const last = end < today ? end : today;
  const days: WonDay[] = [];
  for (let d = parseISODate(start); toISODate(d) <= last; d = new Date(d.getTime() + 86_400_000)) {
    if (!isWorkday(d)) continue;
    const iso = toISODate(d);
    days.push({ date: iso, won: perDate.get(iso) ?? 0 });
  }
  const avg = days.length ? days.reduce((a, d) => a + d.won, 0) / days.length : 0;
  return { days, avg: Math.round(avg * 100) / 100 };
}

export interface StateFieldDay {
  date: string;
  value: number;
}

const STATE_TREND_FIELDS = ["leadsAnalysis", "leadsDetailsIdent", "oppsOpen"] as const;

/** Daily team totals of "state" metrics (levels, not daily events) from
 * `start` to `last`: the sum over employees on each day a report carried
 * the field, carried forward over days without an upload instead of
 * dropping to zero. One pass over rows already read. */
function stateTrends(
  rows: readonly Doc<"performanceReports">[],
  names: ReadonlyMap<Id<"performanceEmployees">, string>,
  start: string,
  last: string,
): Record<(typeof STATE_TREND_FIELDS)[number], StateFieldDay[]> {
  const byField = new Map<keyof MetricFields, Map<string, number>>(
    STATE_TREND_FIELDS.map((f) => [f, new Map()]),
  );
  for (const r of rows) {
    if (!names.has(r.employeeId)) continue;
    for (const f of STATE_TREND_FIELDS) {
      const v = r[f];
      if (v === undefined) continue;
      const m = byField.get(f)!;
      m.set(r.reportDate, (m.get(r.reportDate) ?? 0) + v);
    }
  }
  const out = {} as Record<(typeof STATE_TREND_FIELDS)[number], StateFieldDay[]>;
  for (const f of STATE_TREND_FIELDS) {
    const m = byField.get(f)!;
    const series: StateFieldDay[] = [];
    let carry = 0;
    for (
      let d = parseISODate(start);
      toISODate(d) <= last;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const iso = toISODate(d);
      const v = m.get(iso);
      if (v !== undefined) carry = v;
      series.push({ date: iso, value: carry });
    }
    out[f] = series;
  }
  return out;
}

// ------------------------------------------------------------ data status

export interface DataStatus {
  lead: string | null;
  opp: string | null;
  call: string | null;
  interactions: string | null;
}

/** Newest report date per source, so a source that stopped arriving is
 * visible instead of hiding behind one "Datenstand". From the newest
 * upload log rows (each carries its report's own date) and the newest
 * interaction. */
async function dataStatus(ctx: QueryCtx, companyId: Id<"companies">): Promise<DataStatus> {
  const [logs, lastInteraction] = await Promise.all([
    ctx.db
      .query("performanceUploadLog")
      .withIndex("by_company_uploadedAt", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(100),
    ctx.db
      .query("performanceInteractions")
      .withIndex("by_company_date", (q) => q.eq("companyId", companyId))
      .order("desc")
      .first(),
  ]);
  const out: DataStatus = {
    lead: null,
    opp: null,
    call: null,
    interactions: lastInteraction?.date ?? null,
  };
  for (const l of logs) {
    const kind = l.reportKind;
    if (!l.reportDate || (kind !== "lead" && kind !== "opp" && kind !== "call")) continue;
    if (!out[kind] || l.reportDate > out[kind]!) out[kind] = l.reportDate;
  }
  return out;
}

// ------------------------------------------------------------------ badges

/** Uploads of the dashboard after `since` — what can invalidate cached
 * badges. */
async function uploadsSince(
  ctx: Ctx,
  companyId: Id<"companies">,
  since: number,
): Promise<UploadStamp[]> {
  const rows = await ctx.db
    .query("performanceUploadLog")
    .withIndex("by_company_uploadedAt", (q) => q.eq("companyId", companyId).gt("uploadedAt", since))
    .collect();
  return rows.map((r) => ({
    uploadedAt: r.uploadedAt,
    reportDate: r.reportDate,
    reportKind: r.reportKind,
  }));
}

/** Cached badge rows of the dashboard by month, and the uploads that came
 * in after the oldest of them. */
async function badgeCacheState(ctx: Ctx, companyId: Id<"companies">) {
  const rows = await ctx.db
    .query("performanceBadgeCache")
    .withIndex("by_company_ym", (q) => q.eq("companyId", companyId))
    .collect();
  const byYm = new Map(rows.map((r) => [r.ym, r]));
  const oldest = rows.reduce<number | undefined>(
    (min, r) => (min === undefined || r.computedAt < min ? r.computedAt : min),
    undefined,
  );
  const uploads = oldest === undefined ? [] : await uploadsSince(ctx, companyId, oldest);
  return { byYm, uploads };
}

/** Rows without this version were awarded under older rules (two
 * hardcoded names left out, months frozen on the 1st) and are recomputed. */
const BADGE_RULES_VERSION = 2;

/** A cached month can be used when it was computed under the current rules,
 * no report of that month was imported after it was computed, and every
 * winner is still on the dashboard. */
function cachedBadgesUsable(
  row: Doc<"performanceBadgeCache">,
  uploads: readonly UploadStamp[],
  roster: ReadonlyMap<Id<"performanceEmployees">, string>,
  opts: { nextMonthSales?: boolean } = {},
): boolean {
  if (row.rulesVersion !== BADGE_RULES_VERSION) return false;
  if (badgeCacheStale(row.ym, row.computedAt, uploads, opts)) return false;
  return Object.values(row.badges).every((b) =>
    b.winners.every((w) => roster.has(w as Id<"performanceEmployees">)),
  );
}

/** Badges of every completed month. Uses `performanceBadgeCache` where the
 * row is still valid, computes the rest live (a month in its first days
 * after month end, or one with a newer upload). */
async function allBadgesMap(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  months: readonly string[],
  cache: QueryCache,
): Promise<Record<string, Record<string, BadgeResult>>> {
  if (cache.badges) return cache.badges;
  const roster = await loadRoster(ctx, companyId, cache);
  const { byYm, uploads } = await badgeCacheState(ctx, companyId);
  const data: Record<string, Record<string, BadgeResult>> = {};
  for (const ym of months) {
    if (!monthCompleted(ym)) continue;
    const row = byYm.get(ym);
    const got =
      row && badgeCacheReady(ym) && cachedBadgesUsable(row, uploads, roster.names)
        ? row.badges
        : awardBadges((await teamTotals(ctx, companyId, ym, cache)).snaps);
    if (Object.keys(got).length > 0) data[ym] = got;
  }
  cache.badges = data;
  return data;
}

/**
 * Keeps `performanceBadgeCache` current — run daily (crons.ts). A month is
 * frozen only from its `BADGE_CACHE_DELAY_DAYS`th day after month end (the
 * last day's call report comes later), and recomputed when a report of
 * that month was imported after it was computed. A still-valid row gets
 * its `computedAt` moved forward, meaning "known to be current as of": the
 * next check then only has to look at uploads since this run.
 */
export const cacheCompletedMonthBadges = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ computed: number; confirmed: number }> => {
    const companies = await ctx.db.query("companies").collect();
    const now = Date.now();
    let computed = 0;
    let confirmed = 0;
    for (const company of companies) {
      const cache = newQueryCache();
      const roster = await loadRoster(ctx, company._id, cache);
      const { byYm, uploads } = await badgeCacheState(ctx, company._id);
      for (const ym of await teamMonths(ctx, company._id)) {
        if (!badgeCacheReady(ym)) continue;
        const row = byYm.get(ym);
        if (row && cachedBadgesUsable(row, uploads, roster.names, { nextMonthSales: true })) {
          if (uploads.some((u) => u.uploadedAt > row.computedAt)) {
            await ctx.db.patch(row._id, { computedAt: now });
            confirmed++;
          }
          continue;
        }
        const badges = awardBadges((await teamTotals(ctx, company._id, ym, cache)).snaps);
        if (row) {
          await ctx.db.patch(row._id, {
            badges,
            computedAt: now,
            rulesVersion: BADGE_RULES_VERSION,
          });
        } else {
          await ctx.db.insert("performanceBadgeCache", {
            companyId: company._id,
            ym,
            badges,
            computedAt: now,
            rulesVersion: BADGE_RULES_VERSION,
          });
        }
        computed++;
      }
    }
    return { computed, confirmed };
  },
});

function badgeCounts(
  all: Record<string, Record<string, BadgeResult>>,
): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const badges of Object.values(all)) {
    for (const [key, info] of Object.entries(badges)) {
      for (const employeeId of info.winners) {
        counts[employeeId] ??= {};
        counts[employeeId][key] = (counts[employeeId][key] ?? 0) + 1;
      }
    }
  }
  return counts;
}

// ------------------------------------------------------------------ queries

/** Team dashboard: admins and the dashboard's team/department leads.
 * Without `companyId` the viewer's default dashboard; without `ym` the
 * current month (the previous one until the current has data). */
export const teamDashboard = userQuery({
  args: {
    ym: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, { ym: ymArg, companyId: companyIdArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);

    const cache = newQueryCache();
    const months = await teamMonths(ctx, companyId);
    const ym = ymArg ?? defaultYm(months);
    const roster = await loadRoster(ctx, companyId, cache);
    const summary = await teamTotals(ctx, companyId, ym, cache);
    const { total, snaps, unqualified, coverage, asOf } = summary;
    const days = callDays(await monthRows(ctx, companyId, ym, cache), roster.names, ym);

    const vmYm = shiftYm(ym, -1);
    const vjYm = shiftYm(ym, -12);
    const vm = await teamReference(ctx, companyId, ym, vmYm, asOf, months, cache);
    const vj = await teamReference(ctx, companyId, ym, vjYm, asOf, months, cache);

    const allBadges = await allBadgesMap(ctx, companyId, months, cache);
    const monthDone = monthCompleted(ym);
    const latest = asOf.sales ?? asOf.calls;

    return {
      ym,
      months,
      total,
      snaps,
      unqualified,
      days,
      hasCalls: hasCallData(total),
      wonTrend: await closedWonTrend(ctx, companyId, undefined, cache),
      loggedIn: days.map((d) => ({ date: d.date, count: d.loggedIn })),
      badgeCounts: badgeCounts(allBadges),
      marks: marksForMonth(snaps, {
        completed: monthDone,
        workdaysElapsed: workdaysElapsed(ym, latest ? parseISODate(latest) : todayBerlin()),
      }),
      monthDone,
      coverage,
      dataStatus: await dataStatus(ctx, companyId),
      comparison: comparisonInfo(ym, asOf, vm, vj),
      dVm: comparisonDeltas(total, vm?.cut, vm?.full),
      dVj: comparisonDeltas(total, vj?.cut, vj?.full),
      vmYm,
      vjYm,
    };
  },
});

export interface DevelopmentMonth {
  ym: string;
  leadsCreated?: number;
  workableCreated?: number;
  unqualifiedTotal: number;
  wonMonth?: number;
  hitrate?: number;
}

/** Team-level "Entwicklung" tab: the trailing 3 calendar months ending with
 * the actual current month (ignores the selected month, like
 * `closedWonTrend`). Each month's rows are read once and every series is
 * computed from them. */
export const teamDevelopment = userQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, { companyId: companyIdArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);

    const cache = newQueryCache();
    const current = currentYm();
    const months = [shiftYm(current, -2), shiftYm(current, -1), current];
    const roster = await loadRoster(ctx, companyId, cache);

    const monthly: DevelopmentMonth[] = [];
    const callsPerDay: CallDay[] = [];
    const rows: Doc<"performanceReports">[] = [];
    for (const ym of months) {
      const { total, unqualified } = await teamTotals(ctx, companyId, ym, cache);
      monthly.push({
        ym,
        leadsCreated: total.leadsCreated,
        workableCreated: total.workableCreated,
        unqualifiedTotal: unqualified.reduce((a, r) => a + r.count, 0),
        wonMonth: total.wonMonth,
        hitrate: total.hitrate,
      });
      const monthReports = await monthRows(ctx, companyId, ym, cache);
      callsPerDay.push(...callDays(monthReports, roster.names, ym));
      rows.push(...monthReports);
    }

    const today = toISODate(todayBerlin());
    const end = monthBounds(current).end;
    const trends = stateTrends(
      rows,
      roster.names,
      monthBounds(months[0]).start,
      end < today ? end : today,
    );
    const wonTrend = await closedWonTrend(ctx, companyId, undefined, cache);

    return {
      monthly,
      closedWonPerDay: wonTrend.days,
      wonPerDayAvg: wonTrend.avg,
      callsPerDay,
      leadsAnalysisPerDay: trends.leadsAnalysis,
      leadsDetailsIdentPerDay: trends.leadsDetailsIdent,
      oppsOpenPerDay: trends.oppsOpen,
    };
  },
});

/** One employee's detail/history page — an admin, the dashboard's lead, or
 * the employee themself. Reads the employee's own rows once (all months)
 * plus the team's rows of the shown month (benchmarks, call coverage). */
export const employeeDetail = userQuery({
  args: {
    employeeId: v.id("performanceEmployees"),
    ym: v.optional(v.string()),
  },
  handler: async (ctx, { employeeId, ym: ymArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const { employee, companyId } = await requireViewableEmployee(ctx, viewer, employeeId);
    if (!countsOnDashboard(employee)) {
      throw new ConvexError({ code: "not_found", message: "Mitarbeiter nicht gefunden." });
    }

    const cache = newQueryCache();
    const names = new Map([[employeeId, employee.name]]);
    const own = await ctx.db
      .query("performanceReports")
      .withIndex("by_employee_date", (q) => q.eq("employeeId", employeeId))
      .collect();
    const byMonth = new Map<string, Doc<"performanceReports">[]>();
    for (const r of own) {
      const ym = r.reportDate.slice(0, 7);
      byMonth.set(ym, [...(byMonth.get(ym) ?? []), r]);
    }
    const histMonths = [...byMonth.keys()].sort();
    const ym =
      ymArg && (byMonth.has(ymArg) || ymArg === currentYm()) ? ymArg : defaultYm(histMonths);
    const months = [...new Set([...histMonths, currentYm(), ym])].sort();

    const team = await teamTotals(ctx, companyId, ym, cache);
    const summarize = (m: string, cutoff?: Cutoff): Snapshot | undefined =>
      summarizeMonth(byMonth.get(m) ?? [], names, m, {
        cutoff,
        // Days without any call report are only judged for the shown month
        // (from the team's rows); elsewhere a missing row may be a day off.
        coverage: m === ym && !cutoff ? team.coverage : null,
      }).snaps[0];

    const hist: Snapshot[] = [];
    for (const m of histMonths) {
      const s = summarize(m);
      if (s) hist.push({ ...s, ym: m });
    }
    const cur = hist.find((h) => h.ym === ym);

    const reference = (refYm: string): Reference | undefined => {
      if (!byMonth.has(refYm)) return undefined;
      const full = summarize(refYm);
      const cutoff = cutoffFor(ym, refYm, team.asOf);
      return { cut: cutoff ? summarize(refYm, cutoff) : full, full, cutoff };
    };
    const vm = reference(shiftYm(ym, -1));
    const vj = reference(shiftYm(ym, -12));

    let alerts: ReturnType<typeof employeeSignals>["alerts"] = [];
    let highlights: ReturnType<typeof employeeSignals>["highlights"] = [];
    let avg: Record<string, number | undefined> = {};
    let bench: Record<string, number | undefined> = {};
    if (cur) {
      avg = teamAverages(team.snaps, team.total);
      ({ alerts, highlights } = employeeSignals(cur, avg, vm?.cut, hitrateMinBase(team.snaps)));
      bench = computeTeamBenchmark(team.total, team.snaps);
    }

    const topics = await ctx.db
      .query("performanceTopics")
      .withIndex("by_employee_ym", (q) => q.eq("employeeId", employeeId).eq("ym", ym))
      .collect();
    topics.sort((a, b) => {
      if (a.status === "offen" && b.status !== "offen") return -1;
      if (a.status !== "offen" && b.status === "offen") return 1;
      return (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999");
    });

    const allBadges = await allBadgesMap(ctx, companyId, await teamMonths(ctx, companyId), cache);
    const myBadges: Record<string, number> = {};
    for (const badge of BADGES) myBadges[badge.key] = 0;
    const badgeHist: { ym: string; key: string; value: number }[] = [];
    for (const m of Object.keys(allBadges).sort().reverse()) {
      for (const [key, info] of Object.entries(allBadges[m])) {
        if (!info.winners.includes(employeeId)) continue;
        myBadges[key] = (myBadges[key] ?? 0) + 1;
        badgeHist.push({ ym: m, key, value: info.value });
      }
    }
    const monthBadges = Object.fromEntries(
      Object.entries(allBadges[ym] ?? {}).filter(([, info]) => info.winners.includes(employeeId)),
    );

    return {
      employee: { id: employee._id, name: employee.name },
      hist,
      cur,
      ym,
      months,
      reasons: aggregateReasons([cur?.unqualifiedReasons]),
      alerts,
      highlights,
      avg,
      bench,
      dTeam: comparisonDeltas(cur, bench, undefined),
      topics,
      myBadges,
      monthBadges,
      badgeHist,
      nBadges: badgeHist.length,
      days: callDays(byMonth.get(ym) ?? [], names, ym),
      hasCalls: hasCallData(cur),
      wonTrend: await closedWonTrend(ctx, companyId, employee.name, cache),
      comparison: comparisonInfo(ym, team.asOf, vm, vj),
      dVm: comparisonDeltas(cur, vm?.cut, vm?.full),
      dVj: comparisonDeltas(cur, vj?.cut, vj?.full),
      vm: vm?.cut,
      vj: vj?.cut,
      monthDone: monthCompleted(ym),
    };
  },
});

// ------------------------------------------------------------- interactions

export interface InteractionDay {
  date: string;
  from: number;
  to: number;
  count: number;
  totalDurationSec: number;
  avgDurationSec: number;
  // Only set team-wide (no `employeeId` arg) — one row per employee per
  // day rather than one summed row per day for the whole team.
  employeeId?: Id<"performanceEmployees">;
  employeeName?: string;
}

/** Daily "Interaktionen" evaluation for a date range: first/last
 * interaction, count, total and average duration per day, plus the grand
 * total. One employee's own daily rows when `employeeId` is given;
 * team-wide (admin) otherwise — but team-wide still breaks out one row per
 * employee per day (not summed across the whole team into a single row),
 * since a per-day team total conflates dozens of agents' work into one
 * number. Same admin-or-self visibility rule as `employeeDetail`.
 *
 * The range defaults to the calendar month (`ym`, current month if
 * omitted) but an explicit `start`/`end` (both required together) overrides
 * it — the Interaktionen tab's day/week/month period filter uses this to
 * scope to a single day or week instead of always a full month. */
export const interactionsMonth = userQuery({
  args: {
    ym: v.optional(v.string()),
    start: v.optional(v.string()),
    end: v.optional(v.string()),
    employeeId: v.optional(v.id("performanceEmployees")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (
    ctx,
    { ym: ymArg, start: startArg, end: endArg, employeeId, companyId: companyIdArg },
  ) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId: Id<"companies"> = employeeId
      ? (await requireViewableEmployee(ctx, viewer, employeeId)).companyId
      : requireTeamView(viewer, companyIdArg);

    const ym = ymArg ?? currentYm();
    const { start, end } = startArg && endArg ? { start: startArg, end: endArg } : monthBounds(ym);
    const rows = employeeId
      ? await ctx.db
          .query("performanceInteractions")
          .withIndex("by_employee_date", (q) =>
            q.eq("employeeId", employeeId).gte("date", start).lte("date", end),
          )
          .collect()
      : await ctx.db
          .query("performanceInteractions")
          .withIndex("by_company_date", (q) =>
            q.eq("companyId", companyId).gte("date", start).lte("date", end),
          )
          .collect();

    const names = employeeId ? undefined : await employeeNameMap(ctx, companyId);

    const byKey = new Map<
      string,
      {
        date: string;
        employeeId?: Id<"performanceEmployees">;
        count: number;
        totalSec: number;
        first: number;
        last: number;
      }
    >();
    for (const r of rows) {
      if (names && !names.has(r.employeeId)) continue;
      const key = employeeId ? r.date : `${r.employeeId}\n${r.date}`;
      const cur = byKey.get(key) ?? {
        date: r.date,
        employeeId: employeeId ? undefined : r.employeeId,
        count: 0,
        totalSec: 0,
        first: r.startedAt,
        last: r.startedAt,
      };
      cur.count++;
      cur.totalSec += r.durationSec;
      if (r.startedAt < cur.first) cur.first = r.startedAt;
      if (r.startedAt > cur.last) cur.last = r.startedAt;
      byKey.set(key, cur);
    }

    const days: InteractionDay[] = [...byKey.values()]
      .sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        const nameA = a.employeeId ? (names?.get(a.employeeId) ?? "") : "";
        const nameB = b.employeeId ? (names?.get(b.employeeId) ?? "") : "";
        return nameA.localeCompare(nameB);
      })
      .map((d) => ({
        date: d.date,
        from: d.first,
        to: d.last,
        count: d.count,
        totalDurationSec: d.totalSec,
        avgDurationSec: Math.round(d.totalSec / d.count),
        employeeId: d.employeeId,
        employeeName: d.employeeId ? names?.get(d.employeeId) : undefined,
      }));

    const count = days.reduce((a, d) => a + d.count, 0);
    const totalDurationSec = days.reduce((a, d) => a + d.totalDurationSec, 0);

    return {
      ym,
      days,
      total: {
        count,
        totalDurationSec,
        avgDurationSec: count ? Math.round(totalDurationSec / count) : 0,
      },
    };
  },
});

export interface InteractionRecord {
  id: Id<"performanceInteractions">;
  employeeId: Id<"performanceEmployees">;
  employeeName: string;
  startedAt: number;
  durationSec: number;
  direction: string | undefined;
}

/** The newest day with interactions of one employee — where their
 * Interaktionen tab opens instead of an empty today. */
export const latestInteractionDay = userQuery({
  args: { employeeId: v.id("performanceEmployees") },
  handler: async (ctx, { employeeId }): Promise<string | null> => {
    const viewer = await loadViewer(ctx, ctx.caller);
    await requireViewableEmployee(ctx, viewer, employeeId);
    const last = await ctx.db
      .query("performanceInteractions")
      .withIndex("by_employee_date", (q) => q.eq("employeeId", employeeId))
      .order("desc")
      .first();
    return last?.date ?? null;
  },
});

/** Every individual interaction on one day — the drill-down behind an
 * `interactionsMonth` day row. Team-wide (admin) when `employeeId` is
 * omitted, one employee's own interactions otherwise — same
 * admin-or-self visibility rule as `employeeDetail`. */
export const interactionsDayDetail = userQuery({
  args: {
    date: v.string(),
    employeeId: v.optional(v.id("performanceEmployees")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, { date, employeeId, companyId: companyIdArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId: Id<"companies"> = employeeId
      ? (await requireViewableEmployee(ctx, viewer, employeeId)).companyId
      : requireTeamView(viewer, companyIdArg);

    const rows = employeeId
      ? await ctx.db
          .query("performanceInteractions")
          .withIndex("by_employee_date", (q) => q.eq("employeeId", employeeId).eq("date", date))
          .collect()
      : await ctx.db
          .query("performanceInteractions")
          .withIndex("by_company_date", (q) => q.eq("companyId", companyId).eq("date", date))
          .collect();

    const names = await employeeNameMap(ctx, companyId);
    const records: InteractionRecord[] = rows
      .filter((r) => names.has(r.employeeId))
      .map((r) => ({
        id: r._id,
        employeeId: r.employeeId,
        employeeName: names.get(r.employeeId)!,
        startedAt: r.startedAt,
        durationSec: r.durationSec,
        direction: r.direction,
      }))
      .sort((a, b) => a.startedAt - b.startedAt);

    const count = records.length;
    const totalDurationSec = records.reduce((a, r) => a + r.durationSec, 0);

    return {
      date,
      records,
      total: {
        count,
        totalDurationSec,
        avgDurationSec: count ? Math.round(totalDurationSec / count) : 0,
      },
    };
  },
});

// -------------------------------------------------------------- drill-down

const LISTS: Record<string, { title: string; desc: string; kind: "lead" | "opp" }> = {
  analysis30: {
    title: "Analysis >30 Tage",
    desc: "Leads mit Status Analysis, die älter als 30 Tage sind.",
    kind: "lead",
  },
  leads14: {
    title: "Leads: letzte Aktivität >2 Wochen",
    desc: "Aktive Leads (Open/Analysis) ohne Aktivität seit mehr als 14 Tagen.",
    kind: "lead",
  },
  opp_overdue: {
    title: "Überfällige Opportunities",
    desc: "Offene Opportunities, deren Close Date in der Vergangenheit liegt.",
    kind: "opp",
  },
  opp30: {
    title: "Opportunities >30 Tage",
    desc: "Offene Opportunities, die älter als 30 Tage sind.",
    kind: "opp",
  },
  opps14: {
    title: "Opportunities: letzte Aktivität >2 Wochen",
    desc: "Offene Opportunities ohne Aktivität seit mehr als 14 Tagen.",
    kind: "opp",
  },
};

/** The team's open leads created more than `days` days before the report
 * date (or without a create date) — both lead lists only ever keep those
 * (a lead can't be inactive for longer than it exists), so the rest of the
 * table is never read. The table is replaced wholesale per import, so every
 * row carries the same report date. */
async function teamLeadsOlderThan(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  days: number,
): Promise<Doc<"performanceRawLeads">[]> {
  const any = await ctx.db
    .query("performanceRawLeads")
    .withIndex("by_company_createDate", (q) => q.eq("companyId", companyId))
    .first();
  if (!any) return [];
  const bound = toISODate(new Date(parseISODate(any.reportDate).getTime() - days * 86_400_000));
  return ctx.db
    .query("performanceRawLeads")
    .withIndex("by_company_createDate", (q) => q.eq("companyId", companyId).lt("createDate", bound))
    .collect();
}

function daysBetween(iso: string | undefined, ref: Date): number | null {
  if (!iso) return null;
  return Math.round((ref.getTime() - parseISODate(iso).getTime()) / 86_400_000);
}

export const drilldown = userQuery({
  args: {
    key: v.string(),
    employeeName: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, { key, employeeName, companyId: companyIdArg }) => {
    const def = LISTS[key];
    if (!def) throw new ConvexError({ code: "not_found", message: "Unknown list." });
    const viewer = await loadViewer(ctx, ctx.caller);

    let empFilter = employeeName;
    let companyId: Id<"companies">;
    const dashboard = resolveDashboard(viewer, companyIdArg);
    if (dashboard.canViewTeam) {
      companyId = dashboard.companyId;
    } else {
      // Own numbers only: pin the list to the viewer's own employee name.
      const employee = dashboard.employeeId ? await ctx.db.get(dashboard.employeeId) : null;
      if (!employee || !employee.companyId) {
        throw new ConvexError({
          code: "forbidden",
          message: "Dir ist kein Mitarbeiter zugeordnet.",
        });
      }
      if (empFilter && empFilter !== employee.name) {
        throw new ConvexError({ code: "forbidden", message: "Kein Zugriff." });
      }
      empFilter = employee.name;
      companyId = employee.companyId;
    }

    // An employee viewing their own list (or a lead drilling into one name) only ever
    // wants one owner's rows — push that into the index instead of reading
    // every open lead/opp in the table just to filter it away in memory.
    // The team-wide view (no `empFilter`) genuinely needs every row, so it
    // still collects the whole table.
    let rows: (Doc<"performanceRawLeads"> | Doc<"performanceRawOpps">)[] =
      def.kind === "lead"
        ? empFilter
          ? await ctx.db
              .query("performanceRawLeads")
              .withIndex("by_company_owner", (q) =>
                q.eq("companyId", companyId).eq("owner", empFilter),
              )
              .collect()
          : await teamLeadsOlderThan(ctx, companyId, key === "analysis30" ? 30 : 14)
        : empFilter
          ? await ctx.db
              .query("performanceRawOpps")
              .withIndex("by_company_owner", (q) =>
                q.eq("companyId", companyId).eq("owner", empFilter),
              )
              .collect()
          : await ctx.db
              .query("performanceRawOpps")
              .withIndex("by_company", (q) => q.eq("companyId", companyId))
              .collect();
    const { ownerKeys } = await loadRoster(ctx, companyId);
    rows = rows.filter((r) => ownerKeys.has(r.owner.trim().toLowerCase()));

    interface Item {
      reportDate: string;
      owner: string;
      ageDays: number | null;
      inactiveDays: number | null;
      overdueDays?: number | null;
      sortValue: number;
      [extra: string]: unknown;
    }

    const items: Item[] = [];
    for (const r of rows) {
      const ref = parseISODate(r.reportDate);
      if (def.kind === "lead") {
        const lead = r as Doc<"performanceRawLeads">;
        const ageDays = daysBetween(lead.createDate, ref);
        const inactiveDays = daysBetween(lead.lastActivity ?? lead.createDate, ref);
        const keep =
          key === "analysis30"
            ? (lead.status ?? "").toLowerCase() === "analysis" && (ageDays ?? 0) > 30
            : (inactiveDays ?? 0) > 14; // leads14
        if (!keep) continue;
        items.push({
          ...lead,
          ageDays,
          inactiveDays,
          sortValue: (key === "analysis30" ? ageDays : inactiveDays) ?? 0,
        });
      } else {
        const opp = r as Doc<"performanceRawOpps">;
        const ageDays = opp.age ?? daysBetween(opp.createdDate, ref);
        const inactiveDays = daysBetween(opp.lastActivity ?? opp.createdDate, ref);
        const overdueDays = daysBetween(opp.closeDate, ref);
        let keep: boolean;
        let sortValue: number;
        if (key === "opp_overdue") {
          keep = overdueDays !== null && overdueDays > 0;
          sortValue = overdueDays ?? 0;
        } else if (key === "opp30") {
          keep = (ageDays ?? 0) > 30;
          sortValue = ageDays ?? 0;
        } else {
          keep = (inactiveDays ?? 0) > 14; // opps14
          sortValue = inactiveDays ?? 0;
        }
        if (!keep) continue;
        items.push({ ...opp, ageDays, inactiveDays, overdueDays, sortValue });
      }
    }
    items.sort((a, b) => b.sortValue - a.sortValue);

    const reportDate = rows.length > 0 ? rows[0].reportDate : null;
    const hasCustomerNo = def.kind === "opp" && items.some((i) => !!i.customerNumber);

    return {
      key,
      title: def.title,
      desc: def.desc,
      kind: def.kind,
      items,
      empFilter: empFilter ?? null,
      reportDate,
      hasCustomerNo,
    };
  },
});
