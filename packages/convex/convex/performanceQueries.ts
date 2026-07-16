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
import { parseISODate, toISODate } from "./performance/lib/workdays";
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

async function reportsInRange(
  ctx: QueryCtx,
  ym: string,
  employeeId?: Id<"performanceEmployees">
): Promise<Doc<"performanceReports">[]> {
  const { start, end } = monthBounds(ym);
  if (employeeId) {
    return await ctx.db
      .query("performanceReports")
      .withIndex("by_employee_date", q =>
        q
          .eq("employeeId", employeeId)
          .gte("reportDate", start)
          .lte("reportDate", end)
      )
      .collect();
  }
  return await ctx.db
    .query("performanceReports")
    .withIndex("by_reportDate", q =>
      q.gte("reportDate", start).lte("reportDate", end)
    )
    .collect();
}

/** Latest report per employee within the month — "Monatswert = jüngster
 * Snapshot des Mitarbeiters in diesem Monat". */
async function latestSnapshots(
  ctx: QueryCtx,
  ym: string,
  employeeId?: Id<"performanceEmployees">
): Promise<Snapshot[]> {
  const names = await employeeNameMap(ctx);
  const rows = await reportsInRange(ctx, ym, employeeId);
  const latest = new Map<
    Id<"performanceEmployees">,
    Doc<"performanceReports">
  >();
  for (const r of rows) {
    if (!names.has(r.employeeId)) continue;
    const cur = latest.get(r.employeeId);
    if (!cur || r.reportDate > cur.reportDate) latest.set(r.employeeId, r);
  }
  const snaps = [...latest.entries()].map(([id, r]) =>
    reportToSnapshot(r, names.get(id)!)
  );
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
  employeeId?: Id<"performanceEmployees">
): Promise<Map<Id<"performanceEmployees">, MonthCalls>> {
  const rows = await reportsInRange(ctx, ym, employeeId);
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
  ym: string
): Promise<Set<string>> {
  const rows = await reportsInRange(ctx, ym);
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
  employeeId?: Id<"performanceEmployees">
): Promise<CallDay[]> {
  const names = await employeeNameMap(ctx);
  const rows = await reportsInRange(ctx, ym, employeeId);
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
  employeeId?: Id<"performanceEmployees">
): Promise<boolean> {
  const calls = await monthCallsMap(ctx, ym, employeeId);
  const check = (c: MonthCalls | undefined) =>
    !!(c?.callsToday || c?.talkTotalSec || c?.loginSec);
  if (employeeId) return check(calls.get(employeeId));
  return [...calls.values()].some(check);
}

/** All months that have at least one report — the month selector's
 * options. */
async function monthsWithData(
  ctx: QueryCtx,
  employeeId?: Id<"performanceEmployees">
): Promise<string[]> {
  const names = await employeeNameMap(ctx);
  const rows = employeeId
    ? await ctx.db
        .query("performanceReports")
        .withIndex("by_employee_date", q => q.eq("employeeId", employeeId))
        .collect()
    : await ctx.db.query("performanceReports").collect();
  const yms = new Set<string>();
  for (const r of rows) {
    if (!names.has(r.employeeId)) continue;
    yms.add(r.reportDate.slice(0, 7));
  }
  return [...yms].sort();
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
async function teamTotals(ctx: QueryCtx, ym: string): Promise<TeamTotals> {
  const rawSnaps = await latestSnapshots(ctx, ym);
  const calls = await monthCallsMap(ctx, ym);
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
    calls.size > 0 ? await reportDatesWithCalls(ctx, ym) : undefined;
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
  employeeId: Id<"performanceEmployees">
): Promise<Snapshot[]> {
  const months = await monthsWithData(ctx, employeeId);
  const hist: Snapshot[] = [];
  for (const ym of months) {
    const snaps = await latestSnapshots(ctx, ym, employeeId);
    if (snaps.length === 0) continue;
    let s = snaps[0];
    const calls = await monthCallsMap(ctx, ym, employeeId);
    const c = calls.get(employeeId);
    for (const k of DAILY_KEYS) s[k] = c?.[k];
    s.talkAvgSec = c?.talkAvgSec;
    const asOf = s.reportDate ? parseISODate(s.reportDate) : new Date();
    const missing = c?.workDays
      ? missingCallDays(ym, asOf, await reportDatesWithCalls(ctx, ym))
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
  ym: string
): Promise<Record<string, BadgeResult>> {
  const { snaps } = await teamTotals(ctx, ym);
  return awardBadges(snaps);
}

/** Badges of every completed month. Recomputed per call rather than
 * cached (unlike the reference script's manual cache) — Convex's own
 * query reactivity already avoids redundant work for subscribers, and a
 * sales team's history is small enough that this is cheap regardless. */
async function allBadgesMap(
  ctx: QueryCtx
): Promise<Record<string, Record<string, BadgeResult>>> {
  const months = await monthsWithData(ctx);
  const data: Record<string, Record<string, BadgeResult>> = {};
  for (const ym of months) {
    if (!monthCompleted(ym)) continue;
    const got = await awardBadgesForMonth(ctx, ym);
    if (Object.keys(got).length > 0) data[ym] = got;
  }
  return data;
}

async function badgeCountsForEmployee(
  ctx: QueryCtx,
  employeeId: Id<"performanceEmployees">
): Promise<Record<string, number>> {
  const all = await allBadgesMap(ctx);
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
  employeeId: Id<"performanceEmployees">
): Promise<{ ym: string; key: string; value: number }[]> {
  const all = await allBadgesMap(ctx);
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
    const months = await monthsWithData(ctx);
    const { total, snaps, unqualified } = await teamTotals(ctx, ym);
    const days = await callDaysList(ctx, ym);
    const hasCalls = await hasCallData(ctx, ym);

    const vmYm = shiftYm(ym, -1);
    const vjYm = shiftYm(ym, -12);
    const totalVm = months.includes(vmYm)
      ? (await teamTotals(ctx, vmYm)).total
      : undefined;
    const totalVj = months.includes(vjYm)
      ? (await teamTotals(ctx, vjYm)).total
      : undefined;

    const badgeCounts: Record<string, Record<string, number>> = {};
    const allBadges = await allBadgesMap(ctx);
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

    const hist = await employeeHistoryList(ctx, employeeId);
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
      const { total: teamTotal, snaps: teamSnaps } = await teamTotals(ctx, ym);
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

    const myBadges = await badgeCountsForEmployee(ctx, employeeId);
    const allBadges = await allBadgesMap(ctx);
    const monthBadges = Object.fromEntries(
      Object.entries(allBadges[ym] ?? {}).filter(([, info]) =>
        info.winners.includes(employeeId)
      )
    );
    const badgeHist = await badgeHistoryForEmployee(ctx, employeeId);
    const nBadges = Object.values(myBadges).reduce((a, b) => a + b, 0);

    const days = await callDaysList(ctx, ym, employeeId);
    const hasCalls = await hasCallData(ctx, ym, employeeId);

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
      dVm: computeDeltas(cur, vm),
      dVj: computeDeltas(cur, vj),
      vm,
      vj,
      monthDone: monthCompleted(ym),
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
