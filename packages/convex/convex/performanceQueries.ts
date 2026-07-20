/**
 * Read queries backing the Performance dashboards — team overview, employee
 * detail/history, and the KPI drill-down lists. Ported from the reference
 * script's `latest_snapshots`/`month_calls`/`call_days`/`team_totals`/
 * `employee_history`/`drilldown` routes.
 *
 * Every query takes the caller's Performance session `token` (not Clerk
 * identity — see `performanceAuth.ts`) and enforces the same visibility
 * rule as the source's `may_view_employee`: an admin sees everyone, a
 * `mitarbeiter` login only its own linked employee.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
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
} from "./performance/lib/kpi";
import { EXCLUDED_OWNERS } from "./performance/lib/salesforceImport";
import {
  DAILY_KEYS,
  METRIC_KEYS,
  type MetricFields,
} from "./performance/lib/types";
import {
  isWorkday,
  parseISODate,
  todayUTC,
  toISODate,
} from "./performance/lib/workdays";
import { resolveActiveSession } from "./performanceAuth";

// ------------------------------------------------------------------ helpers

async function requireSession(ctx: QueryCtx, token: string) {
  const resolved = await resolveActiveSession(ctx, token);
  if (!resolved) {
    throw new ConvexError({
      code: "unauthenticated",
      message: "Please sign in.",
    });
  }
  return resolved.login;
}

function requireAdmin(login: Doc<"performanceLogins">): void {
  if (login.role !== "admin") {
    throw new ConvexError({ code: "forbidden", message: "Admins only." });
  }
}

/** Mirrors `may_view_employee`: an admin sees everyone; a `mitarbeiter`
 * login only its own linked employee. */
function requireCanView(
  login: Doc<"performanceLogins">,
  employeeId: Id<"performanceEmployees">
): void {
  if (login.role === "admin") return;
  if (login.employeeId === employeeId) return;
  throw new ConvexError({
    code: "forbidden",
    message: "You can't view this employee.",
  });
}

async function employeeNameMap(
  ctx: QueryCtx
): Promise<Map<Id<"performanceEmployees">, string>> {
  const employees = await ctx.db.query("performanceEmployees").collect();
  return new Map(
    employees
      .filter(e => !EXCLUDED_OWNERS.has(e.name.toLowerCase()))
      .map(e => [e._id, e.name])
  );
}

function reportToSnapshot(
  r: Doc<"performanceReports">,
  name: string
): Snapshot {
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
interface QueryCache {
  reports: Map<string, Doc<"performanceReports">[]>;
  badges?: Record<string, Record<string, BadgeResult>>;
}

function newQueryCache(): QueryCache {
  return { reports: new Map() };
}

async function reportsInRange(
  ctx: QueryCtx,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache
): Promise<Doc<"performanceReports">[]> {
  const key = `${ym}:${employeeId ?? ""}`;
  const hit = cache.reports.get(key);
  if (hit) return hit;

  const { start, end } = monthBounds(ym);
  const rows = employeeId
    ? await ctx.db
        .query("performanceReports")
        .withIndex("by_employee_date", q =>
          q
            .eq("employeeId", employeeId)
            .gte("reportDate", start)
            .lte("reportDate", end)
        )
        .collect()
    : await ctx.db
        .query("performanceReports")
        .withIndex("by_reportDate", q =>
          q.gte("reportDate", start).lte("reportDate", end)
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
function mergeSnapshot(base: Snapshot, next: Snapshot): Snapshot {
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
async function latestSnapshots(
  ctx: QueryCtx,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache
): Promise<Snapshot[]> {
  const names = await employeeNameMap(ctx);
  const rows = await reportsInRange(ctx, ym, employeeId, cache);
  const sorted = [...rows].sort((a, b) =>
    a.reportDate.localeCompare(b.reportDate)
  );
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

interface MonthCalls extends Partial<
  Record<(typeof DAILY_KEYS)[number], number>
> {
  talkAvgSec?: number;
  nDays: number;
  workDays: number;
}

/** Call metrics summed over the month per employee — day-values, so they're
 * summed across report days rather than read as a latest snapshot. The
 * average call duration is weighted (total talk time / total calls), not
 * an average of daily averages, which would be skewed by uneven call
 * counts. */
async function monthCallsMap(
  ctx: QueryCtx,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache
): Promise<Map<Id<"performanceEmployees">, MonthCalls>> {
  const rows = await reportsInRange(ctx, ym, employeeId, cache);
  const sums = new Map<
    Id<"performanceEmployees">,
    {
      vals: Partial<Record<(typeof DAILY_KEYS)[number], number>>;
      nDays: number;
      workDays: number;
    }
  >();
  for (const r of rows) {
    const cur = sums.get(r.employeeId) ?? { vals: {}, nDays: 0, workDays: 0 };
    cur.nDays++;
    if ((r.callsToday ?? 0) > 0) cur.workDays++;
    for (const k of DAILY_KEYS) {
      const v = r[k];
      if (v !== undefined) cur.vals[k] = (cur.vals[k] ?? 0) + v;
    }
    sums.set(r.employeeId, cur);
  }
  const out = new Map<Id<"performanceEmployees">, MonthCalls>();
  for (const [id, { vals, nDays, workDays }] of sums) {
    const calls = vals.callsToday ?? 0;
    out.set(id, {
      ...vals,
      talkAvgSec:
        vals.talkTotalSec && calls
          ? Math.round(vals.talkTotalSec / calls)
          : undefined,
      nDays,
      workDays,
    });
  }
  return out;
}

/** Report dates in the month that have `callsToday` measured at all — the
 * basis for telling "nobody reported this day" apart from "this employee
 * had the day off". */
async function reportDatesWithCalls(
  ctx: QueryCtx,
  ym: string,
  cache: QueryCache
): Promise<Set<string>> {
  const rows = await reportsInRange(ctx, ym, undefined, cache);
  return new Set(
    rows.filter(r => r.callsToday !== undefined).map(r => r.reportDate)
  );
}

interface CallDay {
  date: string;
  values: Partial<Record<(typeof DAILY_KEYS)[number], number>>;
}

/** Every calendar day of the month with that day's summed call metrics
 * (team-wide, or one employee) — feeds the day-by-day chart. */
async function callDaysList(
  ctx: QueryCtx,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache
): Promise<CallDay[]> {
  const names = await employeeNameMap(ctx);
  const rows = await reportsInRange(ctx, ym, employeeId, cache);
  const byDate = new Map<
    string,
    Partial<Record<(typeof DAILY_KEYS)[number], number>>
  >();
  for (const r of rows) {
    if (!names.has(r.employeeId)) continue;
    const cur = byDate.get(r.reportDate) ?? {};
    for (const k of DAILY_KEYS) {
      const v = r[k];
      if (v !== undefined) cur[k] = (cur[k] ?? 0) + v;
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

async function hasCallData(
  ctx: QueryCtx,
  ym: string,
  employeeId: Id<"performanceEmployees"> | undefined,
  cache: QueryCache
): Promise<boolean> {
  const calls = await monthCallsMap(ctx, ym, employeeId, cache);
  const check = (c: MonthCalls | undefined) =>
    !!(c?.callsToday || c?.talkTotalSec || c?.loginSec);
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
  employeeId: Id<"performanceEmployees"> | undefined
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
    .withIndex("by_closeDate", q =>
      q.gte("closeDate", start).lte("closeDate", end)
    )
    .collect();

  const perDate = new Map<string, number>();
  for (const r of rows) {
    if (EXCLUDED_OWNERS.has(r.owner.toLowerCase())) continue;
    if (ownerName !== undefined && r.owner !== ownerName) continue;
    perDate.set(r.closeDate, (perDate.get(r.closeDate) ?? 0) + 1);
  }

  const today = todayUTC();
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
  const avg = days.length
    ? days.reduce((a, d) => a + d.won, 0) / days.length
    : 0;
  return { days, avg: Math.round(avg * 100) / 100 };
}

/** All months that have at least one report — the month selector's
 * options. */
async function monthsWithData(
  ctx: QueryCtx,
  employeeId?: Id<"performanceEmployees">
): Promise<string[]> {
  const names = await employeeNameMap(ctx);

  if (employeeId) {
    const rows = await ctx.db
      .query("performanceReports")
      .withIndex("by_employee_date", q => q.eq("employeeId", employeeId))
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
    .withIndex("by_reportDate")
    .order("asc")
    .first();
  if (!earliest) return [];
  const latest = await ctx.db
    .query("performanceReports")
    .withIndex("by_reportDate")
    .order("desc")
    .first();

  const yms: string[] = [];
  let ym = earliest.reportDate.slice(0, 7);
  const lastYm = latest!.reportDate.slice(0, 7);
  while (ym <= lastYm) {
    const { start, end } = monthBounds(ym);
    const hit = await ctx.db
      .query("performanceReports")
      .withIndex("by_reportDate", q =>
        q.gte("reportDate", start).lte("reportDate", end)
      )
      .first();
    if (hit) yms.push(ym);
    ym = shiftYm(ym, 1);
  }
  return yms;
}

interface TeamTotals {
  total: Snapshot;
  snaps: Snapshot[];
  unqualified: { reason: string; count: number }[];
}

/** Team KPI total for the month, and every employee's snapshot with call
 * metrics folded in (the "latest snapshot" only carries that one day's
 * daily values — the display values are the month-summed ones) and the
 * FC1 forecast added. */
export async function teamTotals(
  ctx: QueryCtx,
  ym: string,
  cache: QueryCache = newQueryCache()
): Promise<TeamTotals> {
  const rawSnaps = await latestSnapshots(ctx, ym, undefined, cache);
  const calls = await monthCallsMap(ctx, ym, undefined, cache);
  const withCalls = rawSnaps.map(s => {
    const c = calls.get(s.employeeId as Id<"performanceEmployees">);
    const next: Snapshot = { ...s };
    for (const k of DAILY_KEYS) next[k] = c?.[k];
    next.talkAvgSec = c?.talkAvgSec;
    return next;
  });

  const totalRaw: Snapshot = {
    employeeId: "team",
    name: "Team",
    reportDate: null,
  };
  for (const k of METRIC_KEYS) {
    const vals = withCalls
      .map(s => s[k])
      .filter((v): v is number => v !== undefined);
    totalRaw[k] = vals.length ? vals.reduce((a, b) => a + b, 0) : undefined;
  }
  totalRaw.talkAvgSec =
    totalRaw.talkTotalSec && totalRaw.callsToday
      ? Math.round(totalRaw.talkTotalSec / totalRaw.callsToday)
      : undefined;
  let total = enrich(totalRaw);
  total.reportDate = withCalls.reduce<string | null>(
    (max, s) =>
      s.reportDate && (!max || s.reportDate > max) ? s.reportDate : max,
    null
  );
  const unqualified = aggregateReasons(
    withCalls.map(s => s.unqualifiedReasons)
  );
  total = addForecast(total, ym); // team: workday basis

  const asOf = total.reportDate ? parseISODate(total.reportDate) : new Date();
  const present =
    calls.size > 0 ? await reportDatesWithCalls(ctx, ym, cache) : undefined;
  const missing = present ? missingCallDays(ym, asOf, present) : undefined;

  const snaps = withCalls.map(s =>
    addForecast(
      enrich(s),
      ym,
      calls.get(s.employeeId as Id<"performanceEmployees">)?.workDays,
      missing
    )
  );

  return { total, snaps, unqualified };
}

/** History of an employee's month-end (or, for the current month, latest)
 * snapshot for every month they have data, oldest first. */
async function employeeHistoryList(
  ctx: QueryCtx,
  employeeId: Id<"performanceEmployees">,
  cache: QueryCache
): Promise<Snapshot[]> {
  const months = await monthsWithData(ctx, employeeId);
  const hist: Snapshot[] = [];
  for (const ym of months) {
    const snaps = await latestSnapshots(ctx, ym, employeeId, cache);
    if (snaps.length === 0) continue;
    let s = snaps[0];
    const calls = await monthCallsMap(ctx, ym, employeeId, cache);
    const c = calls.get(employeeId);
    for (const k of DAILY_KEYS) s[k] = c?.[k];
    s.talkAvgSec = c?.talkAvgSec;
    const asOf = s.reportDate ? parseISODate(s.reportDate) : new Date();
    const missing = c?.workDays
      ? missingCallDays(ym, asOf, await reportDatesWithCalls(ctx, ym, cache))
      : undefined;
    s = addForecast(enrich(s), ym, c?.workDays, missing);
    s.ym = ym;
    hist.push(s);
  }
  return hist;
}

// ------------------------------------------------------------------ badges

async function awardBadgesForMonth(
  ctx: QueryCtx,
  ym: string,
  cache: QueryCache
): Promise<Record<string, BadgeResult>> {
  const { snaps } = await teamTotals(ctx, ym, cache);
  return awardBadges(snaps);
}

/** Badges of every completed month. Not cached across requests (unlike the
 * reference script's manual cache) — Convex's own query reactivity already
 * avoids redundant work for subscribers, and a sales team's history is small
 * enough that recomputing it once per request is cheap regardless. It *is*
 * memoized on `cache` for the life of one request, though: employeeDetail
 * calls this (directly or via badgeCountsForEmployee/badgeHistoryForEmployee)
 * up to three times, and each call recomputes every completed month's team
 * totals from scratch — real, measured cost worth not paying three times
 * over for the same request. */
async function allBadgesMap(
  ctx: QueryCtx,
  cache: QueryCache
): Promise<Record<string, Record<string, BadgeResult>>> {
  if (cache.badges) return cache.badges;
  const months = await monthsWithData(ctx);
  const data: Record<string, Record<string, BadgeResult>> = {};
  for (const ym of months) {
    if (!monthCompleted(ym)) continue;
    const got = await awardBadgesForMonth(ctx, ym, cache);
    if (Object.keys(got).length > 0) data[ym] = got;
  }
  cache.badges = data;
  return data;
}

async function badgeCountsForEmployee(
  ctx: QueryCtx,
  employeeId: Id<"performanceEmployees">,
  cache: QueryCache
): Promise<Record<string, number>> {
  const all = await allBadgesMap(ctx, cache);
  const counts: Record<string, number> = {};
  for (const badge of BADGES) counts[badge.key] = 0;
  for (const badges of Object.values(all)) {
    for (const [key, info] of Object.entries(badges)) {
      if (info.winners.includes(employeeId))
        counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

async function badgeHistoryForEmployee(
  ctx: QueryCtx,
  employeeId: Id<"performanceEmployees">,
  cache: QueryCache
): Promise<{ ym: string; key: string; value: number }[]> {
  const all = await allBadgesMap(ctx, cache);
  const out: { ym: string; key: string; value: number }[] = [];
  for (const ym of Object.keys(all).sort().reverse()) {
    for (const [key, info] of Object.entries(all[ym])) {
      if (info.winners.includes(employeeId))
        out.push({ ym, key, value: info.value });
    }
  }
  return out;
}

function defaultYm(): string {
  return toISODate(new Date()).slice(0, 7);
}

// ------------------------------------------------------------------ queries

/** Team dashboard: admin only. */
export const teamDashboard = query({
  args: { token: v.string(), ym: v.optional(v.string()) },
  handler: async (ctx, { token, ym: ymArg }) => {
    const login = await requireSession(ctx, token);
    requireAdmin(login);

    const ym = ymArg ?? defaultYm();
    const cache = newQueryCache();
    const months = await monthsWithData(ctx);
    const { total, snaps, unqualified } = await teamTotals(ctx, ym, cache);
    const days = await callDaysList(ctx, ym, undefined, cache);
    const hasCalls = await hasCallData(ctx, ym, undefined, cache);
    const wonTrend = await closedWonTrend(ctx, undefined);

    const vmYm = shiftYm(ym, -1);
    const vjYm = shiftYm(ym, -12);
    const totalVm = months.includes(vmYm)
      ? (await teamTotals(ctx, vmYm, cache)).total
      : undefined;
    const totalVj = months.includes(vjYm)
      ? (await teamTotals(ctx, vjYm, cache)).total
      : undefined;

    const badgeCounts: Record<string, Record<string, number>> = {};
    const allBadges = await allBadgesMap(ctx, cache);
    for (const badges of Object.values(allBadges)) {
      for (const [key, info] of Object.entries(badges)) {
        for (const employeeId of info.winners) {
          badgeCounts[employeeId] ??= {};
          badgeCounts[employeeId][key] =
            (badgeCounts[employeeId][key] ?? 0) + 1;
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

/** One employee's detail/history page. Visible to an admin, or to the
 * employee themself. */
export const employeeDetail = query({
  args: {
    token: v.string(),
    employeeId: v.id("performanceEmployees"),
    ym: v.optional(v.string()),
  },
  handler: async (ctx, { token, employeeId, ym: ymArg }) => {
    const login = await requireSession(ctx, token);
    requireCanView(login, employeeId);

    const employee = await ctx.db.get(employeeId);
    if (!employee || EXCLUDED_OWNERS.has(employee.name.toLowerCase())) {
      throw new ConvexError({
        code: "not_found",
        message: "Employee not found.",
      });
    }

    const cache = newQueryCache();
    const hist = await employeeHistoryList(ctx, employeeId, cache);
    const today = defaultYm();
    const months = [...new Set([...hist.map(h => h.ym!), today])].sort();
    const ym = ymArg && months.includes(ymArg) ? ymArg : today;

    const histMap = new Map(hist.map(h => [h.ym, h]));
    const cur = histMap.get(ym);
    const vm = histMap.get(shiftYm(ym, -1));
    const vj = histMap.get(shiftYm(ym, -12));
    const reasons = cur ? aggregateReasons([cur.unqualifiedReasons]) : [];

    let alerts: ReturnType<typeof employeeSignals>["alerts"] = [];
    let highlights: ReturnType<typeof employeeSignals>["highlights"] = [];
    let avg: Record<string, number | undefined> = {};
    let bench: Record<string, number | undefined> = {};
    if (cur) {
      const { total: teamTotal, snaps: teamSnaps } = await teamTotals(
        ctx,
        ym,
        cache
      );
      avg = teamAverages(teamSnaps, teamTotal);
      ({ alerts, highlights } = employeeSignals(
        cur,
        avg,
        vm,
        hitrateMinBase(teamSnaps)
      ));
      bench = computeTeamBenchmark(teamTotal, teamSnaps);
    }
    const dTeam = computeDeltas(cur, bench);

    const topics = await ctx.db
      .query("performanceTopics")
      .withIndex("by_employee_ym", q =>
        q.eq("employeeId", employeeId).eq("ym", ym)
      )
      .collect();
    topics.sort((a, b) => {
      if (a.status === "offen" && b.status !== "offen") return -1;
      if (a.status !== "offen" && b.status === "offen") return 1;
      return (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999");
    });

    const myBadges = await badgeCountsForEmployee(ctx, employeeId, cache);
    const allBadges = await allBadgesMap(ctx, cache);
    const monthBadges = Object.fromEntries(
      Object.entries(allBadges[ym] ?? {}).filter(([, info]) =>
        info.winners.includes(employeeId)
      )
    );
    const badgeHist = await badgeHistoryForEmployee(ctx, employeeId, cache);
    const nBadges = Object.values(myBadges).reduce((a, b) => a + b, 0);

    const days = await callDaysList(ctx, ym, employeeId, cache);
    const hasCalls = await hasCallData(ctx, ym, employeeId, cache);
    const wonTrend = await closedWonTrend(ctx, employeeId);

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

/** Daily "Interaktionen" evaluation for one month: first/last interaction,
 * count, total and average duration per day, plus the month's grand total.
 * One employee's own daily rows when `employeeId` is given; team-wide (
 * admin) otherwise — but team-wide still breaks out one row per employee
 * per day (not summed across the whole team into a single row), since a
 * per-day team total conflates dozens of agents' work into one number.
 * Same admin-or-self visibility rule as `employeeDetail`. */
export const interactionsMonth = query({
  args: {
    token: v.string(),
    ym: v.optional(v.string()),
    employeeId: v.optional(v.id("performanceEmployees")),
  },
  handler: async (ctx, { token, ym: ymArg, employeeId }) => {
    const login = await requireSession(ctx, token);
    if (employeeId) {
      requireCanView(login, employeeId);
    } else {
      requireAdmin(login);
    }

    const ym = ymArg ?? defaultYm();
    const { start, end } = monthBounds(ym);
    const rows = employeeId
      ? await ctx.db
          .query("performanceInteractions")
          .withIndex("by_employee_date", q =>
            q.eq("employeeId", employeeId).gte("date", start).lte("date", end)
          )
          .collect()
      : await ctx.db
          .query("performanceInteractions")
          .withIndex("by_date", q => q.gte("date", start).lte("date", end))
          .collect();

    const names = employeeId ? undefined : await employeeNameMap(ctx);

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
      .map(d => ({
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
export const interactionsDayDetail = query({
  args: {
    token: v.string(),
    date: v.string(),
    employeeId: v.optional(v.id("performanceEmployees")),
  },
  handler: async (ctx, { token, date, employeeId }) => {
    const login = await requireSession(ctx, token);
    if (employeeId) {
      requireCanView(login, employeeId);
    } else {
      requireAdmin(login);
    }

    const rows = employeeId
      ? await ctx.db
          .query("performanceInteractions")
          .withIndex("by_employee_date", q =>
            q.eq("employeeId", employeeId).eq("date", date)
          )
          .collect()
      : await ctx.db
          .query("performanceInteractions")
          .withIndex("by_date", q => q.eq("date", date))
          .collect();

    const names = await employeeNameMap(ctx);
    const records: InteractionRecord[] = rows
      .filter(r => names.has(r.employeeId))
      .map(r => ({
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

const LISTS: Record<
  string,
  { title: string; desc: string; kind: "lead" | "opp" }
> = {
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

export const drilldown = query({
  args: {
    token: v.string(),
    key: v.string(),
    employeeName: v.optional(v.string()),
  },
  handler: async (ctx, { token, key, employeeName }) => {
    const def = LISTS[key];
    if (!def)
      throw new ConvexError({ code: "not_found", message: "Unknown list." });
    const login = await requireSession(ctx, token);

    let empFilter = employeeName;
    if (login.role !== "admin") {
      if (!login.employeeId) {
        throw new ConvexError({
          code: "forbidden",
          message: "No linked employee.",
        });
      }
      const employee = await ctx.db.get(login.employeeId);
      if (!employee) {
        throw new ConvexError({
          code: "forbidden",
          message: "No linked employee.",
        });
      }
      if (empFilter && empFilter !== employee.name) {
        throw new ConvexError({ code: "forbidden", message: "Not allowed." });
      }
      empFilter = employee.name;
    }

    let rows: (Doc<"performanceRawLeads"> | Doc<"performanceRawOpps">)[] =
      def.kind === "lead"
        ? await ctx.db.query("performanceRawLeads").collect()
        : await ctx.db.query("performanceRawOpps").collect();
    rows = rows.filter(r => !EXCLUDED_OWNERS.has(r.owner.toLowerCase()));
    if (empFilter) rows = rows.filter(r => r.owner === empFilter);

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
        const inactiveDays = daysBetween(
          lead.lastActivity ?? lead.createDate,
          ref
        );
        const keep =
          key === "analysis30"
            ? (lead.status ?? "").toLowerCase() === "analysis" &&
              (ageDays ?? 0) > 30
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
        const inactiveDays = daysBetween(
          opp.lastActivity ?? opp.createdDate,
          ref
        );
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
    const hasCustomerNo =
      def.kind === "opp" && items.some(i => !!i.customerNumber);

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
