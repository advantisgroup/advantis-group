/**
 * Read queries backing the Performance dashboards — team overview, employee
 * detail/history, and the KPI drill-down lists. Ported from the reference
 * script's `latest_snapshots`/`month_calls`/`call_days`/`team_totals`/
 * `employee_history`/`drilldown` routes.
 *
 * Every query runs as the signed-in intranet user and goes through
 * `lib/access.ts`: admins see every dashboard, a team/department lead their
 * dashboard's team view, everyone else only their own employee page.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { internalMutation, userQuery } from "../functions";
import { type QueryCtx } from "../_generated/server";
import {
  addForecast,
  aggregateReasons,
  awardBadges,
  BADGES,
  computeDeltas,
  computeTeamBenchmark,
  employeeSignals,
  enrich,
  hitrateMinBase,
  missingCallDays,
  monthBounds,
  monthCompleted,
  performanceMarks,
  shiftYm,
  teamAverages,
  type BadgeResult,
  type Snapshot,
} from "./lib/kpi";
import { EXCLUDED_OWNERS } from "./lib/salesforceImport";
import { DAILY_KEYS, type MetricFields } from "./lib/types";
import { isWorkday, parseISODate, todayBerlin, toISODate } from "./lib/workdays";
import { loadViewer, requireTeamView, requireViewableEmployee } from "./lib/access";
import {
  type Ctx,
  type MonthCalls,
  type QueryCache,
  employeeNameMap,
  latestSnapshots,
  monthCallsMap,
  newQueryCache,
  plausibleDailyValue,
  reportDatesWithCalls,
  reportsInRange,
  teamTotals,
} from "./lib/reports";

interface CallDay {
  date: string;
  values: Partial<Record<(typeof DAILY_KEYS)[number], number>>;
}

/** Every calendar day of the month with that day's summed call metrics
 * (team-wide, or one employee) — feeds the day-by-day chart. */
async function callDaysList(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache,
): Promise<CallDay[]> {
  const names = await employeeNameMap(ctx, companyId);
  const rows = await reportsInRange(ctx, companyId, ym, employeeId, cache);
  const byDate = new Map<string, Partial<Record<(typeof DAILY_KEYS)[number], number>>>();
  for (const r of rows) {
    if (!names.has(r.employeeId)) continue;
    const cur = byDate.get(r.reportDate) ?? {};
    for (const k of DAILY_KEYS) {
      const v = r[k];
      if (v === undefined) continue;
      const safe = plausibleDailyValue(k, v);
      if (safe !== undefined) cur[k] = (cur[k] ?? 0) + safe;
    }
    byDate.set(r.reportDate, cur);
  }
  const { start, end } = monthBounds(ym);
  const out: CallDay[] = [];
  const last = parseISODate(end);
  for (
    let d = parseISODate(start);
    d.getTime() <= last.getTime();
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const iso = toISODate(d);
    out.push({ date: iso, values: byDate.get(iso) ?? {} });
  }
  return out;
}

export interface LoggedInDay {
  date: string;
  count: number;
}

/** Every calendar day of the month with the count of distinct employees who
 * had a lead created that day ("logged in" — created leads that day =
 * attendance, per the Team tab's brief) — feeds the day-by-day chart there.
 * Reads `performanceRawLeads`, which is a full snapshot of currently-active
 * leads (see the schema comment), so an employee's older leads that have
 * since converted/closed can drop out of this count for past days —
 * accepted trade-off, there's no daily-attendance history stored anywhere
 * else to fall back to. */
async function loggedInDaysList(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  ym: string,
): Promise<LoggedInDay[]> {
  const { start, end } = monthBounds(ym);
  const rows = await ctx.db
    .query("performanceRawLeads")
    .withIndex("by_company_createDate", (q) =>
      q.eq("companyId", companyId).gte("createDate", start).lte("createDate", end),
    )
    .collect();

  const byDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.createDate || EXCLUDED_OWNERS.has(r.owner.toLowerCase())) continue;
    const owners = byDate.get(r.createDate) ?? new Set<string>();
    owners.add(r.owner);
    byDate.set(r.createDate, owners);
  }

  const out: LoggedInDay[] = [];
  const last = parseISODate(end);
  for (
    let d = parseISODate(start);
    d.getTime() <= last.getTime();
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const iso = toISODate(d);
    out.push({ date: iso, count: byDate.get(iso)?.size ?? 0 });
  }
  return out;
}

async function hasCallData(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache,
): Promise<boolean> {
  const calls = await monthCallsMap(ctx, companyId, ym, employeeId, cache);
  const check = (c: MonthCalls | undefined) => !!(c?.callsToday || c?.talkTotalSec || c?.loginSec);
  if (employeeId) return check(calls.get(employeeId));
  return [...calls.values()].some(check);
}

export interface WonDay {
  date: string;
  won: number;
}

/** Daily closed-won series (team-wide, or one employee) for the trailing 3
 * calendar months ending with the *actual* current month, workdays only —
 * feeds the trend chart shown above the dashboard / at the top of the
 * employee detail page. Deliberately ignores the dashboard's selected `ym`
 * filter — it's meant to always show "the last 3 months", not "3 months
 * ending with whatever month you're browsing". Reads `performanceWonOpps`
 * (one row per opportunity, keyed by its actual Close Date) rather than
 * diffing `performanceReports.wonMonth` day-over-day — that cumulative
 * counter only advances on days an Opportunity report is actually
 * uploaded, so with uploads spaced days or weeks apart it produced one
 * lump-sum spike instead of a real daily trend. */
async function closedWonTrend(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  employeeId: Id<"performanceEmployees"> | undefined,
): Promise<{ days: WonDay[]; avg: number }> {
  const currentYm = defaultYm();
  const { start } = monthBounds(shiftYm(currentYm, -2));
  const { end } = monthBounds(currentYm);

  let ownerName: string | undefined;
  if (employeeId) {
    const employee = await ctx.db.get(employeeId);
    if (!employee) return { days: [], avg: 0 };
    ownerName = employee.name;
  }

  const rows = await ctx.db
    .query("performanceWonOpps")
    .withIndex("by_company_closeDate", (q) =>
      q.eq("companyId", companyId).gte("closeDate", start).lte("closeDate", end),
    )
    .collect();

  const perDate = new Map<string, number>();
  for (const r of rows) {
    if (EXCLUDED_OWNERS.has(r.owner.toLowerCase())) continue;
    if (ownerName !== undefined && r.owner !== ownerName) continue;
    perDate.set(r.closeDate, (perDate.get(r.closeDate) ?? 0) + 1);
  }

  const today = todayBerlin();
  const endDate = parseISODate(end);
  const last = endDate.getTime() < today.getTime() ? endDate : today;
  const days: WonDay[] = [];
  for (
    let d = parseISODate(start);
    d.getTime() <= last.getTime();
    d = new Date(d.getTime() + 86_400_000)
  ) {
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

/** Daily team-wide trend of a "state" metric (a level, not a daily event
 * count — e.g. `oppsOpen`, `leadsAnalysis`, `leadsDetailsIdent`) over the
 * same trailing-3-month window as `closedWonTrend`, for the team-level
 * Entwicklung tab. Each import writes one row per employee for its own
 * report date with that day's *known* state — summing every employee's
 * value on a day something was actually uploaded gives that day's true
 * team total; a day with no upload at all gets no rows, so its value is
 * carried forward from the last day we did have data, rather than reading
 * as a (wrong) drop to zero. */
async function stateFieldTrend(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  field: keyof MetricFields,
): Promise<StateFieldDay[]> {
  const currentYm = defaultYm();
  const { start } = monthBounds(shiftYm(currentYm, -2));
  const { end } = monthBounds(currentYm);
  const names = await employeeNameMap(ctx, companyId);

  const rows = await ctx.db
    .query("performanceReports")
    .withIndex("by_company_reportDate", (q) =>
      q.eq("companyId", companyId).gte("reportDate", start).lte("reportDate", end),
    )
    .collect();

  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (!names.has(r.employeeId)) continue;
    const v = r[field];
    if (v === undefined) continue;
    byDate.set(r.reportDate, (byDate.get(r.reportDate) ?? 0) + v);
  }

  const today = todayBerlin();
  const endDate = parseISODate(end);
  const last = endDate.getTime() < today.getTime() ? endDate : today;
  const out: StateFieldDay[] = [];
  let carry = 0;
  for (
    let d = parseISODate(start);
    d.getTime() <= last.getTime();
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const iso = toISODate(d);
    const v = byDate.get(iso);
    if (v !== undefined) carry = v;
    out.push({ date: iso, value: carry });
  }
  return out;
}

/** All months that have at least one report — the month selector's
 * options. */
async function monthsWithData(
  ctx: Ctx,
  companyId: Id<"companies">,
  employeeId?: Id<"performanceEmployees">,
): Promise<string[]> {
  const names = await employeeNameMap(ctx, companyId);

  if (employeeId) {
    const rows = await ctx.db
      .query("performanceReports")
      .withIndex("by_employee_date", (q) => q.eq("employeeId", employeeId))
      .collect();
    const yms = new Set<string>();
    for (const r of rows) {
      if (!names.has(r.employeeId)) continue;
      yms.add(r.reportDate.slice(0, 7));
    }
    return [...yms].sort();
  }

  // Team-wide: `performanceReports` gains roughly one row per employee per
  // report day and never shrinks, so a plain `.collect()` here read every
  // report ever imported just to bucket its date — the largest single read
  // cost on `teamDashboard`/`employeeDetail` (the latter via
  // `allBadgesMap`), both of which call this on every page load. A normal
  // import never writes an excluded owner's row in the first place (see
  // `isPerson` in salesforceImport.ts), so a per-month existence check —
  // one indexed read instead of the whole table — is safe in practice, not
  // just cheap.
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
  let ym = earliest.reportDate.slice(0, 7);
  const lastYm = latest!.reportDate.slice(0, 7);
  while (ym <= lastYm) {
    const { start, end } = monthBounds(ym);
    const hit = await ctx.db
      .query("performanceReports")
      .withIndex("by_company_reportDate", (q) =>
        q.eq("companyId", companyId).gte("reportDate", start).lte("reportDate", end),
      )
      .first();
    if (hit) yms.push(ym);
    ym = shiftYm(ym, 1);
  }
  return yms;
}

/** History of an employee's month-end (or, for the current month, latest)
 * snapshot for every month they have data, oldest first. */
async function employeeHistoryList(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  employeeId: Id<"performanceEmployees">,
  cache: QueryCache,
): Promise<Snapshot[]> {
  const months = await monthsWithData(ctx, companyId, employeeId);
  const hist: Snapshot[] = [];
  for (const ym of months) {
    const snaps = await latestSnapshots(ctx, companyId, ym, employeeId, cache);
    if (snaps.length === 0) continue;
    let s = snaps[0];
    const calls = await monthCallsMap(ctx, companyId, ym, employeeId, cache);
    const c = calls.get(employeeId);
    for (const k of DAILY_KEYS) s[k] = c?.[k];
    s.talkAvgSec = c?.talkAvgSec;
    const asOf = s.reportDate ? parseISODate(s.reportDate) : todayBerlin();
    const missing = c?.workDays
      ? missingCallDays(ym, asOf, await reportDatesWithCalls(ctx, companyId, ym, cache))
      : undefined;
    s = addForecast(enrich(s), ym, c?.workDays, missing);
    s.ym = ym;
    hist.push(s);
  }
  return hist;
}

// ------------------------------------------------------------------ badges

async function awardBadgesForMonth(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  cache: QueryCache,
): Promise<Record<string, BadgeResult>> {
  const { snaps } = await teamTotals(ctx, companyId, ym, cache);
  return awardBadges(snaps);
}

/** Badges of every completed month. A completed month's reports don't change
 * (see the "historical data doesn't change once reported" convention in
 * performanceImport.ts's `upsertSnapshot`), so once a month is done its badge
 * result is permanent — `performanceBadgeCache` (backfilled nightly by
 * `cacheCompletedMonthBadges`) is a point read for any month it already has.
 * A month that isn't cached yet (freshly completed, before the next cron
 * run) still falls back to computing it live here, so this is never wrong,
 * only sometimes not yet cached. Also memoized on `cache` for the life of one
 * request: employeeDetail calls this (directly or via
 * badgeCountsForEmployee/badgeHistoryForEmployee) up to three times. */
async function allBadgesMap(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  cache: QueryCache,
): Promise<Record<string, Record<string, BadgeResult>>> {
  if (cache.badges) return cache.badges;
  const months = await monthsWithData(ctx, companyId);
  const data: Record<string, Record<string, BadgeResult>> = {};
  for (const ym of months) {
    if (!monthCompleted(ym)) continue;
    const cached = await ctx.db
      .query("performanceBadgeCache")
      .withIndex("by_company_ym", (q) => q.eq("companyId", companyId).eq("ym", ym))
      .unique();
    const got = cached ? cached.badges : await awardBadgesForMonth(ctx, companyId, ym, cache);
    if (Object.keys(got).length > 0) data[ym] = got;
  }
  cache.badges = data;
  return data;
}

/** Backfills `performanceBadgeCache` for every completed month that doesn't
 * have a row yet — run nightly (see crons.ts). Skips months already cached,
 * since a completed month's badges never change once computed. */
export const cacheCompletedMonthBadges = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ cached: number }> => {
    const companies = await ctx.db.query("companies").collect();
    let cached = 0;
    for (const company of companies) {
      const months = await monthsWithData(ctx, company._id);
      const cache = newQueryCache();
      for (const ym of months) {
        if (!monthCompleted(ym)) continue;
        const existing = await ctx.db
          .query("performanceBadgeCache")
          .withIndex("by_company_ym", (q) => q.eq("companyId", company._id).eq("ym", ym))
          .unique();
        if (existing) continue;
        const badges = await awardBadgesForMonth(ctx, company._id, ym, cache);
        await ctx.db.insert("performanceBadgeCache", {
          companyId: company._id,
          ym,
          badges,
          computedAt: Date.now(),
        });
        cached++;
      }
    }
    return { cached };
  },
});

async function badgeCountsForEmployee(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  employeeId: Id<"performanceEmployees">,
  cache: QueryCache,
): Promise<Record<string, number>> {
  const all = await allBadgesMap(ctx, companyId, cache);
  const counts: Record<string, number> = {};
  for (const badge of BADGES) counts[badge.key] = 0;
  for (const badges of Object.values(all)) {
    for (const [key, info] of Object.entries(badges)) {
      if (info.winners.includes(employeeId)) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

async function badgeHistoryForEmployee(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  employeeId: Id<"performanceEmployees">,
  cache: QueryCache,
): Promise<{ ym: string; key: string; value: number }[]> {
  const all = await allBadgesMap(ctx, companyId, cache);
  const out: { ym: string; key: string; value: number }[] = [];
  for (const ym of Object.keys(all).sort().reverse()) {
    for (const [key, info] of Object.entries(all[ym])) {
      if (info.winners.includes(employeeId)) out.push({ ym, key, value: info.value });
    }
  }
  return out;
}

/** The current month in Berlin. Note: inside a cached Convex query this
 * only moves on when the query re-runs (any data change), which is fine for
 * a month boundary. */
function defaultYm(): string {
  return toISODate(todayBerlin()).slice(0, 7);
}

// ------------------------------------------------------------------ queries

/** Team dashboard: admins and the dashboard's team/department leads. Without
 * `companyId` the viewer's default dashboard (see `resolveDashboard`). */
export const teamDashboard = userQuery({
  args: {
    ym: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, { ym: ymArg, companyId: companyIdArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);

    const ym = ymArg ?? defaultYm();
    const cache = newQueryCache();
    const months = await monthsWithData(ctx, companyId);
    const { total, snaps, unqualified } = await teamTotals(ctx, companyId, ym, cache);
    const days = await callDaysList(ctx, companyId, ym, undefined, cache);
    const hasCalls = await hasCallData(ctx, companyId, ym, undefined, cache);
    const wonTrend = await closedWonTrend(ctx, companyId, undefined);
    const loggedIn = await loggedInDaysList(ctx, companyId, ym);

    const vmYm = shiftYm(ym, -1);
    const vjYm = shiftYm(ym, -12);
    const totalVm = months.includes(vmYm)
      ? (await teamTotals(ctx, companyId, vmYm, cache)).total
      : undefined;
    const totalVj = months.includes(vjYm)
      ? (await teamTotals(ctx, companyId, vjYm, cache)).total
      : undefined;

    const badgeCounts: Record<string, Record<string, number>> = {};
    const allBadges = await allBadgesMap(ctx, companyId, cache);
    for (const badges of Object.values(allBadges)) {
      for (const [key, info] of Object.entries(badges)) {
        for (const employeeId of info.winners) {
          badgeCounts[employeeId] ??= {};
          badgeCounts[employeeId][key] = (badgeCounts[employeeId][key] ?? 0) + 1;
        }
      }
    }

    return {
      ym,
      months,
      total,
      snaps,
      unqualified,
      days,
      hasCalls,
      wonTrend,
      loggedIn,
      badgeCounts,
      marks: performanceMarks(snaps),
      monthDone: monthCompleted(ym),
      dVm: computeDeltas(total, totalVm),
      dVj: computeDeltas(total, totalVj),
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

/** Team-level "Entwicklung" tab: trailing 3 calendar months ending with the
 * actual current month, admin only — same window convention as
 * `closedWonTrend`, deliberately ignoring the dashboard's selected `ym`
 * filter for the same reason. `monthly` gives one point per month for the
 * funnel/hitrate/unqualified metrics (naturally monthly, not daily); the
 * rest are full daily series over the whole window. */
export const teamDevelopment = userQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, { companyId: companyIdArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);

    const cache = newQueryCache();
    const currentYm = defaultYm();
    const months = [shiftYm(currentYm, -2), shiftYm(currentYm, -1), currentYm];

    const monthly: DevelopmentMonth[] = [];
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
    }

    const wonTrend = await closedWonTrend(ctx, companyId, undefined);
    const callsPerDay: CallDay[] = [];
    for (const ym of months) {
      callsPerDay.push(...(await callDaysList(ctx, companyId, ym, undefined, cache)));
    }
    const leadsAnalysisPerDay = await stateFieldTrend(ctx, companyId, "leadsAnalysis");
    const leadsDetailsIdentPerDay = await stateFieldTrend(ctx, companyId, "leadsDetailsIdent");
    const oppsOpenPerDay = await stateFieldTrend(ctx, companyId, "oppsOpen");

    return {
      monthly,
      closedWonPerDay: wonTrend.days,
      wonPerDayAvg: wonTrend.avg,
      callsPerDay,
      leadsAnalysisPerDay,
      leadsDetailsIdentPerDay,
      oppsOpenPerDay,
    };
  },
});

/** One employee's detail/history page. Visible to an admin, or to the
 * employee themself. */
export const employeeDetail = userQuery({
  args: {
    employeeId: v.id("performanceEmployees"),
    ym: v.optional(v.string()),
  },
  handler: async (ctx, { employeeId, ym: ymArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const { employee, companyId } = await requireViewableEmployee(ctx, viewer, employeeId);
    if (EXCLUDED_OWNERS.has(employee.name.toLowerCase())) {
      throw new ConvexError({ code: "not_found", message: "Mitarbeiter nicht gefunden." });
    }

    const cache = newQueryCache();
    const hist = await employeeHistoryList(ctx, companyId, employeeId, cache);
    const today = defaultYm();
    const months = [...new Set([...hist.map((h) => h.ym!), today])].sort();
    const ym = ymArg && months.includes(ymArg) ? ymArg : today;

    const histMap = new Map(hist.map((h) => [h.ym, h]));
    const cur = histMap.get(ym);
    const vm = histMap.get(shiftYm(ym, -1));
    const vj = histMap.get(shiftYm(ym, -12));
    const reasons = cur ? aggregateReasons([cur.unqualifiedReasons]) : [];

    let alerts: ReturnType<typeof employeeSignals>["alerts"] = [];
    let highlights: ReturnType<typeof employeeSignals>["highlights"] = [];
    let avg: Record<string, number | undefined> = {};
    let bench: Record<string, number | undefined> = {};
    if (cur) {
      const { total: teamTotal, snaps: teamSnaps } = await teamTotals(ctx, companyId, ym, cache);
      avg = teamAverages(teamSnaps, teamTotal);
      ({ alerts, highlights } = employeeSignals(cur, avg, vm, hitrateMinBase(teamSnaps)));
      bench = computeTeamBenchmark(teamTotal, teamSnaps);
    }
    const dTeam = computeDeltas(cur, bench);

    const topics = await ctx.db
      .query("performanceTopics")
      .withIndex("by_employee_ym", (q) => q.eq("employeeId", employeeId).eq("ym", ym))
      .collect();
    topics.sort((a, b) => {
      if (a.status === "offen" && b.status !== "offen") return -1;
      if (a.status !== "offen" && b.status === "offen") return 1;
      return (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999");
    });

    const myBadges = await badgeCountsForEmployee(ctx, companyId, employeeId, cache);
    const allBadges = await allBadgesMap(ctx, companyId, cache);
    const monthBadges = Object.fromEntries(
      Object.entries(allBadges[ym] ?? {}).filter(([, info]) => info.winners.includes(employeeId)),
    );
    const badgeHist = await badgeHistoryForEmployee(ctx, companyId, employeeId, cache);
    const nBadges = Object.values(myBadges).reduce((a, b) => a + b, 0);

    const days = await callDaysList(ctx, companyId, ym, employeeId, cache);
    const hasCalls = await hasCallData(ctx, companyId, ym, employeeId, cache);
    const wonTrend = await closedWonTrend(ctx, companyId, employeeId);

    return {
      employee: { id: employee._id, name: employee.name },
      hist,
      cur,
      ym,
      months,
      reasons,
      alerts,
      highlights,
      avg,
      bench,
      dTeam,
      topics,
      myBadges,
      monthBadges,
      badgeHist,
      nBadges,
      days,
      hasCalls,
      wonTrend,
      dVm: computeDeltas(cur, vm),
      dVj: computeDeltas(cur, vj),
      vm,
      vj,
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

    const ym = ymArg ?? defaultYm();
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
    title: "Leads: Last Activity >2 Wochen",
    desc: "Aktive Leads (Open/Analysis) ohne Aktivität seit mehr als 14 Tagen.",
    kind: "lead",
  },
  opp_overdue: {
    title: "Overdue Opportunities",
    desc: "Offene Opportunities, deren Close Date in der Vergangenheit liegt.",
    kind: "opp",
  },
  opp30: {
    title: "Opportunities >30 Tage",
    desc: "Offene Opportunities, die älter als 30 Tage sind.",
    kind: "opp",
  },
  opps14: {
    title: "Opportunities: Last Activity >2 Wochen",
    desc: "Offene Opportunities ohne Aktivität seit mehr als 14 Tagen.",
    kind: "opp",
  },
};

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
    const dashboard = companyIdArg
      ? viewer.dashboards.find((d) => d.companyId === companyIdArg)
      : (viewer.dashboards.find((d) => d.canViewTeam) ?? viewer.dashboards[0]);
    if (!dashboard) {
      throw new ConvexError({ code: "forbidden", message: "Kein Zugriff auf dieses Dashboard." });
    }
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
          : await ctx.db
              .query("performanceRawLeads")
              .withIndex("by_company_createDate", (q) => q.eq("companyId", companyId))
              .collect()
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
    rows = rows.filter((r) => !EXCLUDED_OWNERS.has(r.owner.toLowerCase()));

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
