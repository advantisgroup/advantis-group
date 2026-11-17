/**
 * "Kunden-Spiegel" tab of a dashboard linked to the Onboarding-Cockpit — see
 * `lib/onboardingMirror.ts` for what each part counts.
 */
import { v } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { userQuery } from "../functions";
import { displayName } from "../lib/users";
import { berlinDate } from "../time/lib/berlin";
import { loadViewer, requireTeamView } from "./lib/access";
import { monthBounds, shiftYm } from "./lib/kpi";
import { isClosedStatus, milestonesOf } from "./lib/onboarding";
import {
  actionsByCustomerMonth,
  closedReasons,
  cohortFunnel,
  type MirrorCase,
  openStages,
  tempo,
  type TimedEvent,
  ymOf,
} from "./lib/onboardingMirror";
import { type Ctx } from "./lib/reports";
import { todayBerlin, toISODate } from "./lib/workdays";
import {
  basisArg,
  cockpitEvents,
  cockpitSince,
  outcomeKindsByLabel,
  requireCockpitDashboard,
} from "./onboardingKpis";
import { itOpenSince } from "./onboarding";
import { currentYm } from "./queries";

const YM = /^\d{4}-\d{2}$/;

function toMirror(c: Doc<"onboardingCases">): MirrorCase {
  return {
    id: c._id,
    closeDate: c.closeDate ?? null,
    status: c.status,
    closed: isClosedStatus(c.status),
    archived: c.archivedAt !== undefined,
    milestones: new Set(milestonesOf(c)),
    contactAttempts: c.contactAttempts ?? 0,
    itOpen: itOpenSince(c) !== null,
    closedAt: c.closedAt ?? null,
    cardsAt: c.cardsOrderedAt ?? null,
    fuelAt: c.fuelledAt ?? null,
    twoMonthAt: c.twoMonthCheckAt ?? null,
  };
}

/** The full log of the given cases, with exact times. */
async function caseLogs(ctx: Ctx, ids: readonly string[]): Promise<Map<string, TimedEvent[]>> {
  const kinds = await outcomeKindsByLabel(ctx);
  const out = new Map<string, TimedEvent[]>();
  for (const id of ids) {
    const rows = await ctx.db
      .query("onboardingContacts")
      .withIndex("by_case", (q) => q.eq("caseId", id as Doc<"onboardingCases">["_id"]))
      .collect();
    out.set(
      id,
      rows.map((r) => ({
        caseId: r.caseId,
        kind: r.kind,
        fromValue: r.fromValue,
        toValue: r.toValue,
        outcomeKind:
          r.kind === "outcome"
            ? (r.outcomeKind ?? kinds.get((r.toValue ?? "").split(" › ")[0]) ?? "other")
            : undefined,
        byUserId: r.byUserId,
        day: berlinDate(r.at),
        at: r.at,
      })),
    );
  }
  return out;
}

export const get = userQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    ym: v.optional(v.string()),
    basis: basisArg,
  },
  handler: async (ctx, { companyId: companyIdArg, ym: ymArg, basis }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);
    await requireCockpitDashboard(ctx, companyId);
    const ym = ymArg && YM.test(ymArg) ? ymArg : currentYm();
    const won = basis === "won";
    const since = await cockpitSince(ctx);

    const docs = await ctx.db.query("onboardingCases").collect();
    const cases = docs.map(toMirror);
    const closeYm = new Map(cases.map((c) => [c.id, ymOf(c.closeDate)]));
    const cohortOf = (m: string) => cases.filter((c) => closeYm.get(c.id) === m);
    const cohort = cohortOf(ym);

    // Tempo is only measured for customers won since the cockpit logs contacts.
    const measurable = (list: MirrorCase[]) =>
      since ? list.filter((c) => c.closeDate !== null && c.closeDate >= since) : [];
    const trendMonths: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftYm(ym, -i);
      if (since && m >= since.slice(0, 7)) trendMonths.push(m);
    }
    const vmYm = shiftYm(ym, -1);
    const needLog = new Set<string>(cohort.map((c) => c.id));
    for (const m of [...trendMonths, vmYm])
      for (const c of measurable(cohortOf(m))) needLog.add(c.id);
    const logs = await caseLogs(ctx, [...needLog]);

    const { start, end } = monthBounds(ym);
    const today = toISODate(todayBerlin());
    const monthEvents = await cockpitEvents(ctx, start, end < today ? end : today);

    const monthStart = Date.parse(`${start}T00:00:00Z`) - 2 * 3_600_000;
    const monthEnd = Date.parse(`${end}T23:59:59Z`);
    const closedInMonth = cases.filter(
      (c) => c.closedAt !== null && c.closedAt >= monthStart && c.closedAt <= monthEnd,
    );

    return {
      ym,
      basis: won ? "won" : "all",
      cockpitSince: since,
      funnel: cohortFunnel(cohort, logs),
      actions: actionsByCustomerMonth(monthEvents, (id) => closeYm.get(id) ?? null, ym),
      open: openStages(won ? cohort : cases),
      reasons: closedReasons(won ? cohort.filter((c) => c.closed) : closedInMonth),
      tempo: {
        cur: tempo(measurable(cohort), logs, berlinDate),
        vm: tempo(measurable(cohortOf(vmYm)), logs, berlinDate),
        trend: trendMonths.map((m) => ({
          ym: m,
          ...tempo(measurable(cohortOf(m)), logs, berlinDate).steps,
        })),
      },
    };
  },
});

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: number, to: number) => Math.max(0, (to - from) / DAY_MS);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Case tracking of the Onboarding-Cockpit for the Kunden-Spiegel (17.11.):
 * cases opened with UTA ("Case eröffnet › Grund") – how many are open, how
 * many were opened / closed in the month, how long they take, per reason
 * and per consultant, and the ones open the longest.
 */
export const cases = userQuery({
  args: { companyId: v.optional(v.id("companies")), ym: v.optional(v.string()) },
  handler: async (ctx, { companyId: companyIdArg, ym: ymArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);
    await requireCockpitDashboard(ctx, companyId);
    const ym = ymArg && YM.test(ymArg) ? ymArg : currentYm();
    const vm = shiftYm(ym, -1);
    const now = Date.now();
    const tickets = await ctx.db.query("onboardingTickets").collect();
    const caseDocs = new Map<string, Doc<"onboardingCases"> | null>();
    for (const tk of tickets) {
      if (!caseDocs.has(tk.caseId)) caseDocs.set(tk.caseId, await ctx.db.get(tk.caseId));
    }
    const names = new Map<string, string>();
    const nameOf = async (uid: Doc<"onboardingCases">["assigneeUserId"]) => {
      if (!uid) return null;
      if (!names.has(uid)) names.set(uid, displayName(await ctx.db.get(uid)));
      return names.get(uid) ?? null;
    };
    const inYm = (ms: number | undefined, m: string) =>
      ms !== undefined && berlinDate(ms).slice(0, 7) === m;

    const open = tickets.filter((t) => t.closedAt === undefined);
    const monthStats = (m: string) => {
      const closed = tickets.filter((t) => inYm(t.closedAt, m));
      return {
        opened: tickets.filter((t) => inYm(t.openedAt, m)).length,
        closed: closed.length,
        avgDays: avg(closed.map((t) => daysBetween(t.openedAt, t.closedAt!))),
      };
    };

    const reasons = new Map<
      string,
      { label: string; open: number; openedMonth: number; closedDays: number[] }
    >();
    for (const t of tickets) {
      const r = reasons.get(t.label) ?? { label: t.label, open: 0, openedMonth: 0, closedDays: [] };
      if (t.closedAt === undefined) r.open++;
      else r.closedDays.push(daysBetween(t.openedAt, t.closedAt));
      if (inYm(t.openedAt, ym)) r.openedMonth++;
      reasons.set(t.label, r);
    }

    const consultants = new Map<string, { name: string; open: number; openDays: number[] }>();
    for (const t of open) {
      const c = caseDocs.get(t.caseId);
      const name = (await nameOf(c?.assigneeUserId)) ?? "–";
      const e = consultants.get(name) ?? { name, open: 0, openDays: [] };
      e.open++;
      e.openDays.push(daysBetween(t.openedAt, now));
      consultants.set(name, e);
    }

    const longest = [];
    for (const t of [...open].sort((a, b) => a.openedAt - b.openedAt).slice(0, 8)) {
      const c = caseDocs.get(t.caseId);
      longest.push({
        customerNumber: c?.customerNumber ?? "–",
        label: t.label,
        days: Math.floor(daysBetween(t.openedAt, now)),
        assigneeName: await nameOf(c?.assigneeUserId),
        checks: t.checks,
      });
    }

    return {
      ym,
      total: tickets.length,
      openNow: open.length,
      itOpen: open.filter((t) => t.isIt).length,
      openAvgAge: avg(open.map((t) => daysBetween(t.openedAt, now))),
      cur: monthStats(ym),
      vm: monthStats(vm),
      reasons: [...reasons.values()]
        .map((r) => ({
          label: r.label,
          open: r.open,
          openedMonth: r.openedMonth,
          closed: r.closedDays.length,
          avgDays: avg(r.closedDays),
        }))
        .sort((a, b) => b.open + b.closed - (a.open + a.closed)),
      consultants: [...consultants.values()]
        .map((c) => ({ name: c.name, open: c.open, avgAge: avg(c.openDays) }))
        .sort((a, b) => b.open - a.open),
      longest,
    };
  },
});
