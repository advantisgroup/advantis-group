/**
 * "Kunden-Spiegel" tab of a dashboard linked to the Onboarding-Cockpit — see
 * `lib/onboardingMirror.ts` for what each part counts.
 */
import { v } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { userQuery } from "../functions";
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
