/**
 * Onboarding tab of the Performance dashboard: for a dashboard linked to
 * the Onboarding-Cockpit (`companies.onboardingCockpit`), each team
 * member's contacts, reachability, milestones and closed cases from the
 * cockpit log, next to their Genesys call figures — month to date with VM
 * and VJ to the same workday, plus the last months' trend.
 *
 * The link ("Schnittstelle") works through the intranet account: a cockpit
 * entry's `byUserId` is the `userId` of the person's row on the dashboard.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { userQuery } from "../functions";
import { berlinDate, berlinInstant } from "../time/lib/berlin";
import { loadViewer, requireTeamView, requireViewableEmployee } from "./lib/access";
import { monthBounds, monthCompleted, shiftYm, type Snapshot } from "./lib/kpi";
import {
  CALL_KEYS,
  COCKPIT_KEYS,
  type CockpitEvent,
  cockpitCounts,
  onboardingValues,
  sumCockpit,
} from "./lib/onboardingKpis";
import {
  type Ctx,
  type Cutoff,
  loadRoster,
  newQueryCache,
  type QueryCache,
  teamTotals,
} from "./lib/reports";
import { todayBerlin, toISODate } from "./lib/workdays";
import { cutoffFor, currentYm } from "./queries";

const YM = /^\d{4}-\d{2}$/;
const TREND_MONTHS = 6;

async function requireCockpitDashboard(
  ctx: Ctx,
  companyId: Id<"companies">,
): Promise<Doc<"companies">> {
  const company = await ctx.db.get(companyId);
  if (!company?.onboardingCockpit) {
    throw new ConvexError({
      code: "validation",
      message: "Dieses Dashboard ist nicht mit dem Onboarding-Cockpit verknüpft.",
    });
  }
  return company;
}

/** Cockpit log entries of the days `from`–`to` (Berlin). */
async function cockpitEvents(ctx: Ctx, from: string, to: string): Promise<CockpitEvent[]> {
  const rows = await ctx.db
    .query("onboardingContacts")
    .withIndex("by_at", (q) =>
      q.gte("at", berlinInstant(from)).lt("at", berlinInstant(to) + 26 * 3_600_000),
    )
    .collect();
  return rows
    .map((r) => ({
      caseId: r.caseId,
      kind: r.kind,
      fromValue: r.fromValue,
      toValue: r.toValue,
      byUserId: r.byUserId,
      day: berlinDate(r.at),
    }))
    .filter((e) => e.day >= from && e.day <= to);
}

/** First day with any cockpit entry — earlier periods have no cockpit data
 * (shown as "–", not 0). */
async function cockpitSince(ctx: Ctx): Promise<string | null> {
  const first = await ctx.db.query("onboardingContacts").withIndex("by_at").first();
  return first ? berlinDate(first.at) : null;
}

interface Period {
  ym: string;
  from: string;
  to: string;
  callsCutoff: Cutoff | undefined;
}

/** The month itself (up to today while it runs) and VM/VJ cut at the same
 * workday — the same rule as the rest of the dashboard. */
async function periods(
  ctx: Ctx,
  companyId: Id<"companies">,
  ym: string,
  cache: QueryCache,
): Promise<{ cur: Period; vm: Period; vj: Period }> {
  const today = toISODate(todayBerlin());
  const { start, end } = monthBounds(ym);
  const cur: Period = { ym, from: start, to: end < today ? end : today, callsCutoff: undefined };
  const team = await teamTotals(ctx, companyId, ym, cache);
  const asOf = { sales: cur.to, calls: team.asOf.calls ?? cur.to };
  const ref = (refYm: string): Period => {
    const bounds = monthBounds(refYm);
    const cutoff = monthCompleted(ym) ? undefined : cutoffFor(ym, refYm, asOf);
    return {
      ym: refYm,
      from: bounds.start,
      to: cutoff?.sales ?? bounds.end,
      callsCutoff: cutoff,
    };
  };
  return { cur, vm: ref(shiftYm(ym, -1)), vj: ref(shiftYm(ym, -12)) };
}

/** The dashboard's people with their intranet account. */
async function people(
  ctx: Ctx,
  companyId: Id<"companies">,
  cache: QueryCache,
): Promise<{ employeeId: Id<"performanceEmployees">; name: string; userId: string | null }[]> {
  const roster = await loadRoster(ctx, companyId, cache);
  const out = [];
  for (const [id, name] of roster.names) {
    const e = await ctx.db.get(id);
    out.push({ employeeId: id, name, userId: e?.userId ?? null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export const team = userQuery({
  args: { companyId: v.optional(v.id("companies")), ym: v.optional(v.string()) },
  handler: async (ctx, { companyId: companyIdArg, ym: ymArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);
    await requireCockpitDashboard(ctx, companyId);
    const ym = ymArg && YM.test(ymArg) ? ymArg : currentYm();
    const cache = newQueryCache();
    const p = await periods(ctx, companyId, ym, cache);
    const persons = await people(ctx, companyId, cache);
    const since = await cockpitSince(ctx);

    const valuesFor = async (period: Period) => {
      const [events, calls] = await Promise.all([
        cockpitEvents(ctx, period.from, period.to),
        teamTotals(ctx, companyId, period.ym, cache, period.callsCutoff),
      ]);
      const counts = cockpitCounts(events, period.from, period.to);
      const has = since !== null && since <= period.to;
      const callsOf = (id: string) => calls.snaps.find((s) => s.employeeId === id);
      const rows = persons.map((pp) => ({
        employeeId: pp.employeeId,
        values: onboardingValues(
          pp.userId ? counts.get(pp.userId) : undefined,
          has,
          callsOf(pp.employeeId),
        ),
      }));
      const mine = persons.flatMap((pp) =>
        pp.userId && counts.has(pp.userId) ? [counts.get(pp.userId)!] : [],
      );
      const total = onboardingValues(
        sumCockpit(mine),
        has,
        calls.snaps.length ? calls.total : undefined,
      );
      return { rows, total };
    };

    const [cur, vm, vj] = await Promise.all([valuesFor(p.cur), valuesFor(p.vm), valuesFor(p.vj)]);

    // Trend: whole months before, the running one to date.
    const trend = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const m = shiftYm(ym, -i);
      const { start, end } = monthBounds(m);
      const today = toISODate(todayBerlin());
      const t = await valuesFor({
        ym: m,
        from: start,
        to: end < today ? end : today,
        callsCutoff: undefined,
      });
      trend.push({ ym: m, values: t.total });
    }

    return {
      ym,
      monthDone: monthCompleted(ym),
      cockpitSince: since,
      period: { from: p.cur.from, to: p.cur.to, vmTo: p.vm.to, vjTo: p.vj.to },
      cockpitKeys: COCKPIT_KEYS,
      callKeys: CALL_KEYS,
      rows: persons.map((pp, i) => ({
        employeeId: pp.employeeId,
        name: pp.name,
        linked: pp.userId !== null,
        cur: cur.rows[i].values,
        vm: vm.rows[i].values,
        vj: vj.rows[i].values,
      })),
      total: { cur: cur.total, vm: vm.total, vj: vj.total },
      trend,
    };
  },
});

/** One person's onboarding figures (their own page, or a lead's view). */
export const employee = userQuery({
  args: { employeeId: v.id("performanceEmployees"), ym: v.optional(v.string()) },
  handler: async (ctx, { employeeId, ym: ymArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const { employee, companyId } = await requireViewableEmployee(ctx, viewer, employeeId);
    await requireCockpitDashboard(ctx, companyId);
    const ym = ymArg && YM.test(ymArg) ? ymArg : currentYm();
    const cache = newQueryCache();
    const p = await periods(ctx, companyId, ym, cache);
    const since = await cockpitSince(ctx);
    const userId = employee.userId ?? null;

    const valuesFor = async (period: Period) => {
      const [events, calls] = await Promise.all([
        cockpitEvents(ctx, period.from, period.to),
        teamTotals(ctx, companyId, period.ym, cache, period.callsCutoff),
      ]);
      const counts = cockpitCounts(events, period.from, period.to);
      const own: Snapshot | undefined = calls.snaps.find((s) => s.employeeId === employeeId);
      return onboardingValues(
        userId ? counts.get(userId) : undefined,
        since !== null && since <= period.to,
        own,
      );
    };
    const [cur, vm, vj] = await Promise.all([valuesFor(p.cur), valuesFor(p.vm), valuesFor(p.vj)]);
    return {
      ym,
      name: employee.name,
      linked: userId !== null,
      cockpitSince: since,
      period: { from: p.cur.from, to: p.cur.to, vmTo: p.vm.to, vjTo: p.vj.to },
      cockpitKeys: COCKPIT_KEYS,
      callKeys: CALL_KEYS,
      cur,
      vm,
      vj,
    };
  },
});
