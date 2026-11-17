import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { userQuery } from "../functions";
import { dashboardKind } from "../performance/lib/roster";
import { loadRoster, newQueryCache, teamTotals } from "../performance/lib/reports";
import { todayBerlin, toISODate } from "../performance/lib/workdays";
import { displayName } from "../lib/users";
import {
  HEALTHY_BONUS,
  HEALTHY_MONTHS,
  healthyDue,
  hitrateBonus,
  monthBonus,
  monthRange,
  shiftYm,
  tierAmount,
  tierLines,
  touchesMonth,
  weekBonus,
  weeksOfMonth,
} from "./rules";

/**
 * Provisionen: the month's commission per sales employee, worked out from
 * the Performance reports (Closed Won, hitrate) and the time tracking's sick
 * notes. Admins only — it is pay data. The automatic figures follow
 * whatever reports are uploaded; `commissionAdjustments` (one row per
 * employee and month) overrides Closed Won / hitrate and records the
 * sick-free bonus as paid, which an admin ticks by hand.
 */

/** How far back the sick-free streak is followed. */
const STREAK_LOOKBACK = 24;

function currentYm(): string {
  return toISODate(todayBerlin()).slice(0, 7);
}

/** Sales dashboards (Performance → Einstellungen), first one = default. */
async function salesDashboards(ctx: QueryCtx): Promise<Doc<"companies">[]> {
  const all = await ctx.db.query("companies").collect();
  return all
    .filter((c) => dashboardKind(c) === "sales")
    .sort((a, b) => a._creationTime - b._creationTime);
}

/** Sick-free months in a row ending with the month before `ym` (the bonus
 * looks at the 3 months before). The count starts no earlier than the
 * person's hire date (or intranet account) and starts over with the month the
 * bonus was last paid in. Also the sick days inside `ym` itself, for display.
 * `null` without a linked intranet person. */
async function healthyStreak(
  ctx: QueryCtx,
  user: Doc<"users"> | null,
  ym: string,
  lastPaidYm: string | null,
): Promise<{ streak: number; sickDays: string[] } | null> {
  if (!user) return null;
  const from = monthRange(shiftYm(ym, -STREAK_LOOKBACK)).start;
  const absences = await ctx.db
    .query("timeAbsences")
    .withIndex("by_user_start", (q) => q.eq("userId", user._id))
    .collect();
  const sick = absences.filter(
    (a) =>
      a.type === "sick" && a.status !== "rejected" && a.status !== "cancelled" && a.endDate >= from,
  );
  const hired = (user.hireDate ?? toISODate(new Date(user.createdAt))).slice(0, 7);
  const firstYm = lastPaidYm && lastPaidYm > hired ? lastPaidYm : hired;
  let streak = 0;
  for (let i = 1; i <= STREAK_LOOKBACK; i++) {
    const m = shiftYm(ym, -i);
    if (m < firstYm) break;
    if (sick.some((a) => touchesMonth(a.startDate, a.endDate, m))) break;
    streak++;
  }
  const { start, end } = monthRange(ym);
  const sickDays = sick
    .filter((a) => touchesMonth(a.startDate, a.endDate, ym))
    .map((a) => {
      const s = a.startDate < start ? start : a.startDate;
      const e = a.endDate > end ? end : a.endDate;
      return s === e ? s : `${s} – ${e}`;
    });
  return { streak, sickDays };
}

/** The last month before `ym` in which the sick-free bonus was paid. */
async function lastHealthyPaid(
  ctx: QueryCtx,
  employeeId: Id<"performanceEmployees">,
  ym: string,
): Promise<string | null> {
  const rows = await ctx.db
    .query("commissionAdjustments")
    .withIndex("by_employee_ym", (q) => q.eq("employeeId", employeeId).lt("ym", ym))
    .order("desc")
    .collect();
  return rows.find((r) => r.healthyPaid === true)?.ym ?? null;
}

export const month = userQuery({
  role: "admin",
  args: {
    ym: v.string(),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, { ym, companyId }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
      throw new ConvexError({ code: "invalid", message: "Monat im Format JJJJ-MM angeben." });
    }
    const dashboards = await salesDashboards(ctx);
    const dashboard = companyId ? dashboards.find((d) => d._id === companyId) : dashboards[0];
    const base = {
      ym,
      running: ym >= currentYm(),
      dashboards: dashboards.map((d) => ({ id: d._id, name: d.name })),
      companyId: dashboard?._id ?? null,
      weeks: weeksOfMonth(ym),
    };
    if (!dashboard) return { ...base, asOf: null, rows: [] };

    const cache = newQueryCache();
    const summary = await teamTotals(ctx, dashboard._id, ym, cache);
    const roster = await loadRoster(ctx, dashboard._id, cache);
    const snaps = new Map(summary.snaps.map((s) => [s.employeeId, s]));
    const weeks = base.weeks;
    const wonOpps = weeks.length
      ? await ctx.db
          .query("performanceWonOpps")
          .withIndex("by_company_closeDate", (q) =>
            q
              .eq("companyId", dashboard._id)
              .gte("closeDate", weeks[0].monday)
              .lte("closeDate", weeks[weeks.length - 1].sunday),
          )
          .collect()
      : [];

    const adjustments = new Map(
      (
        await ctx.db
          .query("commissionAdjustments")
          .withIndex("by_company_ym", (q) => q.eq("companyId", dashboard._id).eq("ym", ym))
          .collect()
      ).map((a) => [a.employeeId, a]),
    );

    // Who counts as Sales: in the Sales department (teams were dropped
    // 11/2026). They are listed first; everyone else follows below.
    const isSales = (name: string) => name.trim().toLowerCase() === "sales";
    const salesDepartments = new Set(
      (await ctx.db.query("departments").collect())
        .filter((dep) => !dep.archivedAt && isSales(dep.name))
        .map((dep) => dep._id),
    );
    const inSales = (user: Doc<"users"> | null) =>
      Boolean(user?.departmentId && salesDepartments.has(user.departmentId));

    const rows = [];
    // Everyone counted on the dashboard, also without report rows this
    // month: the sick-free bonus doesn't depend on sales figures.
    for (const [employeeId, reportName] of roster.names) {
      const snap = snaps.get(employeeId);
      const employee = await ctx.db.get(employeeId);
      const user = employee?.userId ? await ctx.db.get(employee.userId) : null;
      const ownerKey = reportName.trim().toLowerCase();
      const adj = adjustments.get(employeeId);
      const autoWon = snap?.wonMonth ?? 0;
      const autoHitrate = snap?.hitrate ?? null;
      const won = adj?.wonOverride ?? autoWon;
      const hitrate = adj?.hitrateOverride ?? autoHitrate;

      const weekRows = weeks.map((w) => {
        const count = wonOpps.filter(
          (o) =>
            o.owner.trim().toLowerCase() === ownerKey &&
            o.closeDate >= w.monday &&
            o.closeDate <= w.sunday,
        ).length;
        return { kw: w.kw, won: count, bonus: weekBonus(count) };
      });
      const health = await healthyStreak(ctx, user, ym, await lastHealthyPaid(ctx, employeeId, ym));
      const healthyPaid = adj?.healthyPaid === true;

      const tier = tierAmount(won);
      const weeksTotal = weekRows.reduce((s, w) => s + w.bonus, 0);
      const month = monthBonus(won);
      const hit = hitrateBonus(hitrate);
      const healthy = healthyPaid ? HEALTHY_BONUS : 0;
      const extras = (adj?.extras ?? []).map((e) => ({
        id: e.id,
        amount: e.amount,
        label: e.label,
      }));
      const extrasTotal = extras.reduce((sum, e) => sum + e.amount, 0);

      rows.push({
        employeeId,
        sales: inSales(user),
        name: user ? displayName(user) : reportName,
        reportName,
        linked: user !== null,
        won,
        autoWon,
        wonOverridden: adj?.wonOverride !== undefined,
        workable: snap?.workableCreated ?? null,
        hitrate,
        autoHitrate,
        hitrateOverridden: adj?.hitrateOverride !== undefined,
        note: adj?.note ?? null,
        tiers: tierLines(won).filter((l) => l.perDeal > 0 && l.deals > 0),
        tierAmount: tier,
        weeks: weekRows,
        weeksBonus: weeksTotal,
        monthBonus: month,
        hitrateBonus: hit,
        healthyStreak: health?.streak ?? null,
        healthyMonths: HEALTHY_MONTHS,
        sickDays: health?.sickDays ?? [],
        healthyDue: health ? healthyDue(health.streak) : false,
        healthyPaid,
        healthyBonus: healthy,
        extras,
        extrasTotal,
        total: tier + weeksTotal + month + hit + healthy + extrasTotal,
      });
    }
    rows.sort(
      (a, b) =>
        Number(b.sales) - Number(a.sales) || b.total - a.total || a.name.localeCompare(b.name),
    );
    return { ...base, asOf: summary.asOf.sales, rows };
  },
});
