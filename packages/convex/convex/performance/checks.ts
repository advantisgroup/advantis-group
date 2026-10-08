/**
 * Employee checks (monthly, required), KPI checks (optional) and their
 * actions, plus the Monitoring tab — all for team leads and admins only
 * (employees don't see them, decision 10/2026). KPI list and week maths in
 * `lib/checkKpis.ts`.
 *
 * The old "Topics" are superseded by the agreements here; existing open
 * topics still show up in Monitoring (read from `performanceTopics`) so
 * nothing gets lost.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { type PerformanceViewer, loadViewer, requireTeamView } from "./lib/access";
import {
  CHECK_INTERVAL_DAYS,
  type CheckKpiRow,
  type CheckKpis,
  addDays,
  callsPerDayOverRange,
  counterOverRange,
  dueTone,
  percent,
  reasonsOverRange,
  reasonsTotal,
  sortReasons,
  weekStart,
} from "./lib/checkKpis";
import { parseReasons, shiftYm, type Snapshot } from "./lib/kpi";
import {
  type Cutoff,
  loadRoster,
  monthRows,
  newQueryCache,
  summarizeMonth,
  teamTotals,
} from "./lib/reports";
import { dashboardKind } from "./lib/roster";
import { isWorkday, parseISODate, todayBerlin, toISODate } from "./lib/workdays";
import { cutoffFor } from "./queries";

type Ctx = QueryCtx | MutationCtx;

const notFound = (message: string) => new ConvexError({ code: "not_found", message });
const invalid = (message: string) => new ConvexError({ code: "validation", message });

function today(): string {
  return toISODate(todayBerlin());
}

/** The employee with their dashboard, if the viewer leads that dashboard
 * (or is an admin). Checks exist for sales dashboards only. */
async function requireCheckAccess(
  ctx: Ctx,
  viewer: PerformanceViewer,
  employeeId: Id<"performanceEmployees">,
): Promise<{ employee: Doc<"performanceEmployees">; companyId: Id<"companies"> }> {
  const employee = await ctx.db.get(employeeId);
  if (!employee?.companyId) throw notFound("Mitarbeiter nicht gefunden.");
  const companyId = requireTeamView(viewer, employee.companyId);
  return { employee, companyId };
}

// --------------------------------------------------------------- figures

/** The check's KPI figures for one employee as of now. */
export async function liveCheckKpis(
  ctx: Ctx,
  companyId: Id<"companies">,
  employee: Doc<"performanceEmployees">,
): Promise<CheckKpis> {
  const now = today();
  const ym = now.slice(0, 7);
  const cache = newQueryCache();
  const team = await teamTotals(ctx, companyId, ym, cache);

  const own = await ctx.db
    .query("performanceReports")
    .withIndex("by_employee_date", (q) => q.eq("employeeId", employee._id))
    .collect();
  const byMonth = new Map<string, Doc<"performanceReports">[]>();
  for (const r of own) {
    const m = r.reportDate.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  const names = new Map([[employee._id, employee.name]]);
  const summarize = (m: string, cutoff?: Cutoff): Snapshot | undefined =>
    summarizeMonth(byMonth.get(m) ?? [], names, m, {
      cutoff,
      coverage: m === ym && !cutoff ? team.coverage : null,
    }).snaps[0];
  const reference = (refYm: string): Snapshot | undefined => {
    if (!byMonth.has(refYm)) return undefined;
    const cutoff = cutoffFor(ym, refYm, team.asOf);
    return summarize(refYm, cutoff);
  };
  const cur = summarize(ym);
  const vm = reference(shiftYm(ym, -1));
  const vj = reference(shiftYm(ym, -12));

  // The running calendar week, up to the newest data (at most today).
  const newest = [team.asOf.sales, team.asOf.calls]
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  const asOf = newest && newest < now ? newest : now;
  const start = weekStart(asOf);

  const teamDays = new Set<string>();
  for (const m of new Set([start.slice(0, 7), asOf.slice(0, 7)])) {
    for (const r of await monthRows(ctx, companyId, m, cache)) teamDays.add(r.reportDate);
  }
  const missingDays: string[] = [];
  for (let d = start; d <= asOf; d = addDays(d, 1)) {
    if (isWorkday(parseISODate(d)) && !teamDays.has(d)) missingDays.push(d);
  }

  const ownerKey = employee.name.trim().toLowerCase();
  const wonOpps = await ctx.db
    .query("performanceWonOpps")
    .withIndex("by_company_closeDate", (q) =>
      q.eq("companyId", companyId).gte("closeDate", start).lte("closeDate", asOf),
    )
    .collect();
  const wonWeek = wonOpps.filter((o) => o.owner.trim().toLowerCase() === ownerKey).length;

  const leads = await ctx.db
    .query("performanceRawLeads")
    .withIndex("by_company_owner", (q) => q.eq("companyId", companyId).eq("owner", employee.name))
    .collect();
  const analysis30 = leads.length
    ? leads.filter((l) => {
        if ((l.status ?? "").toLowerCase() !== "analysis" || !l.createDate) return false;
        const age =
          (parseISODate(l.reportDate).getTime() - parseISODate(l.createDate).getTime()) /
          86_400_000;
        return age > 30;
      }).length
    : null;

  const leadsWeek = counterOverRange(own, "leadsCreated", start, asOf);
  const workableWeek = counterOverRange(own, "workableCreated", start, asOf);
  const weekReasons = reasonsOverRange(own, start, asOf);
  const monthReasons = sortReasons(
    new Map(parseReasons(cur?.unqualifiedReasons ?? "").map((r) => [r.reason, r.count])),
  );
  const reasonCount = (s: Snapshot | undefined) =>
    s ? reasonsTotal(parseReasons(s.unqualifiedReasons ?? "")) : null;
  const perCallDay = (s: Snapshot | undefined) =>
    s?.callsToday !== undefined && s.callDays
      ? Math.round((s.callsToday / s.callDays) * 10) / 10
      : null;
  const num = (v: number | undefined) => (v === undefined ? null : v);
  const row = (
    key: string,
    pick: (s: Snapshot | undefined) => number | null,
    week: number | null,
  ): CheckKpiRow => ({ key, month: pick(cur), vm: pick(vm), vj: pick(vj), week });

  const rows: CheckKpiRow[] = [
    row("leads", (s) => num(s?.leadsCreated), leadsWeek),
    row("workable", (s) => num(s?.workableCreated), workableWeek),
    row("unqualified", reasonCount, reasonsTotal(weekReasons)),
    row("workableRate", (s) => num(s?.workableRate), percent(workableWeek, leadsWeek)),
    row("won", (s) => num(s?.wonMonth), wonWeek),
    row("wonPerDay", (s) => num(s?.wonPerDay), null),
    row("callsPerDay", perCallDay, callsPerDayOverRange(own, start, asOf)),
    { key: "analysis30", month: analysis30, vm: null, vj: null, week: null },
    row("opps30", (s) => num(s?.oppsOver30), null),
    { key: "randomFirstCall", month: null, vm: null, vj: null, week: null },
    { key: "randomCallNotes", month: null, vm: null, vj: null, week: null },
    { key: "randomContactChain", month: null, vm: null, vj: null, week: null },
  ];

  return {
    asOf,
    ym,
    week: { start, end: asOf, missingDays },
    rows,
    reasons: { month: monthReasons, week: weekReasons },
  };
}

// ----------------------------------------------------------------- reads

/** Live figures for a new check, and when the last required check was. */
export const liveKpis = userQuery({
  args: { employeeId: v.id("performanceEmployees") },
  handler: async (ctx, { employeeId }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const { employee, companyId } = await requireCheckAccess(ctx, viewer, employeeId);
    return {
      employee: { id: employee._id, name: employee.name },
      kind: dashboardKind(await ctx.db.get(companyId)),
      kpis: await liveCheckKpis(ctx, companyId, employee),
    };
  },
});

function ratingCounts(check: Doc<"performanceChecks">) {
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const r of check.ratings) if (r.rating) counts[r.rating]++;
  return counts;
}

/** An employee's checks, newest first, with their open/done actions. */
export const listForEmployee = userQuery({
  args: { employeeId: v.id("performanceEmployees") },
  handler: async (ctx, { employeeId }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    await requireCheckAccess(ctx, viewer, employeeId);
    const [checks, actions] = await Promise.all([
      ctx.db
        .query("performanceChecks")
        .withIndex("by_employee_date", (q) => q.eq("employeeId", employeeId))
        .order("desc")
        .collect(),
      ctx.db
        .query("performanceActions")
        .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
        .collect(),
    ]);
    const last = checks.find((c) => c.type === "employee");
    const nextDue = last ? addDays(last.date, CHECK_INTERVAL_DAYS) : null;
    return {
      lastEmployeeCheck: last?.date ?? null,
      nextDue,
      overdue: !last || (nextDue !== null && nextDue < today()),
      checks: checks.map((c) => ({
        id: c._id,
        type: c.type,
        date: c.date,
        createdByName: c.createdByName,
        ratings: ratingCounts(c),
        open: actions.filter((a) => a.checkId === c._id && !a.doneAt).length,
        total: actions.filter((a) => a.checkId === c._id).length,
      })),
    };
  },
});

/** One check with everything on it (also the print view). */
export const get = userQuery({
  args: { checkId: v.id("performanceChecks") },
  handler: async (ctx, { checkId }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const check = await ctx.db.get(checkId);
    if (!check) throw notFound("Check nicht gefunden.");
    const { employee } = await requireCheckAccess(ctx, viewer, check.employeeId);
    const [actions, company] = await Promise.all([
      ctx.db
        .query("performanceActions")
        .withIndex("by_check", (q) => q.eq("checkId", checkId))
        .collect(),
      ctx.db.get(check.companyId),
    ]);
    return {
      check,
      employee: { id: employee._id, name: employee.name },
      dashboardName: company?.name ?? "",
      actions: actions
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((a) => ({
          id: a._id,
          kpiKey: a.kpiKey ?? null,
          text: a.text,
          dueDate: a.dueDate ?? null,
          done: a.doneAt !== undefined,
        })),
    };
  },
});

// ---------------------------------------------------------------- writes

const ratingValidator = v.union(v.literal("green"), v.literal("yellow"), v.literal("red"));
const actionInput = v.object({
  id: v.optional(v.id("performanceActions")),
  kpiKey: v.optional(v.string()),
  text: v.string(),
  dueDate: v.optional(v.string()),
  done: v.boolean(),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanTexts(list: string[], max: number): string[] {
  return list
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Replaces the actions of one check/review with `inputs`: updates the
 * listed ones, adds new ones, deletes the rest. Done state keeps its
 * original time and name when it doesn't change. */
export async function syncActions(
  ctx: MutationCtx,
  existing: Doc<"performanceActions">[],
  inputs: {
    id?: Id<"performanceActions">;
    kpiKey?: string;
    text: string;
    dueDate?: string;
    done: boolean;
  }[],
  base: Omit<
    Doc<"performanceActions">,
    "_id" | "_creationTime" | "text" | "createdAt" | "kpiKey" | "dueDate" | "doneAt" | "doneByName"
  >,
  actorName: string,
): Promise<void> {
  const now = Date.now();
  const keep = new Set<string>();
  for (const input of inputs) {
    const text = input.text.trim();
    if (!text) continue;
    if (input.dueDate && !ISO_DATE.test(input.dueDate)) throw invalid("Ungültiges Datum.");
    const prev = input.id ? existing.find((a) => a._id === input.id) : undefined;
    const done = input.done
      ? { doneAt: prev?.doneAt ?? now, doneByName: prev?.doneByName ?? actorName }
      : { doneAt: undefined, doneByName: undefined };
    const fields = {
      text,
      kpiKey: input.kpiKey,
      dueDate: input.dueDate || undefined,
      ...done,
    };
    if (prev) {
      keep.add(prev._id);
      await ctx.db.patch(prev._id, fields);
    } else {
      await ctx.db.insert("performanceActions", { ...base, ...fields, createdAt: now });
    }
  }
  for (const a of existing) if (!keep.has(a._id)) await ctx.db.delete(a._id);
}

/** Creates (no `checkId`) or updates a check with its agreements/measures.
 * The KPI figures are frozen when the check is created. */
export const save = userMutation({
  args: {
    checkId: v.optional(v.id("performanceChecks")),
    employeeId: v.id("performanceEmployees"),
    type: v.union(v.literal("employee"), v.literal("kpi")),
    date: v.string(),
    ratings: v.array(
      v.object({
        key: v.string(),
        rating: v.optional(ratingValidator),
        note: v.optional(v.string()),
      }),
    ),
    tops: v.array(v.string()),
    goFors: v.array(v.string()),
    note: v.optional(v.string()),
    actions: v.array(actionInput),
  },
  handler: async (ctx, args): Promise<{ checkId: Id<"performanceChecks"> }> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const { employee, companyId } = await requireCheckAccess(ctx, viewer, args.employeeId);
    if (!ISO_DATE.test(args.date)) throw invalid("Ungültiges Datum.");
    const actor = viewer.name;
    const now = Date.now();
    const fields = {
      type: args.type,
      date: args.date,
      ratings: args.ratings.map((r) => ({
        key: r.key,
        rating: r.rating,
        note: r.note?.trim() || undefined,
      })),
      tops: cleanTexts(args.tops, 3),
      goFors: cleanTexts(args.goFors, 3),
      note: args.note?.trim() || undefined,
      updatedAt: now,
    };

    let checkId = args.checkId;
    if (checkId) {
      const check = await ctx.db.get(checkId);
      if (!check || check.employeeId !== employee._id) throw notFound("Check nicht gefunden.");
      await ctx.db.patch(checkId, fields);
    } else {
      checkId = await ctx.db.insert("performanceChecks", {
        ...fields,
        companyId,
        employeeId: employee._id,
        kpis: await liveCheckKpis(ctx, companyId, employee),
        createdBy: viewer.userId,
        createdByName: actor,
        createdAt: now,
      });
    }

    const existing = await ctx.db
      .query("performanceActions")
      .withIndex("by_check", (q) => q.eq("checkId", checkId))
      .collect();
    await syncActions(
      ctx,
      existing,
      args.actions,
      {
        companyId,
        employeeId: employee._id,
        source: args.type === "employee" ? "agreement" : "kpi",
        checkId,
        createdByName: actor,
      },
      actor,
    );
    return { checkId };
  },
});

export const remove = userMutation({
  args: { checkId: v.id("performanceChecks") },
  handler: async (ctx, { checkId }): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const check = await ctx.db.get(checkId);
    if (!check) return;
    await requireCheckAccess(ctx, viewer, check.employeeId);
    const actions = await ctx.db
      .query("performanceActions")
      .withIndex("by_check", (q) => q.eq("checkId", checkId))
      .collect();
    for (const a of actions) await ctx.db.delete(a._id);
    await ctx.db.delete(checkId);
  },
});

/** Ticks an action (agreement, KPI measure, review measure) done or open. */
export const setActionDone = userMutation({
  args: { actionId: v.id("performanceActions"), done: v.boolean() },
  handler: async (ctx, { actionId, done }): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const action = await ctx.db.get(actionId);
    if (!action) throw notFound("Aufgabe nicht gefunden.");
    requireTeamView(viewer, action.companyId);
    await ctx.db.patch(actionId, {
      doneAt: done ? Date.now() : undefined,
      doneByName: done ? viewer.name : undefined,
    });
  },
});

/** Same for an old topic (shown in Monitoring until all are done). */
export const setTopicDone = userMutation({
  args: { topicId: v.id("performanceTopics"), done: v.boolean() },
  handler: async (ctx, { topicId, done }): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const topic = await ctx.db.get(topicId);
    if (!topic) throw notFound("Thema nicht gefunden.");
    const employee = await ctx.db.get(topic.employeeId);
    if (!employee?.companyId) throw notFound("Mitarbeiter nicht gefunden.");
    requireTeamView(viewer, employee.companyId);
    await ctx.db.patch(topicId, { status: done ? "erreicht" : "offen", updatedAt: Date.now() });
  },
});

// ------------------------------------------------------------- monitoring

export interface OpenItem {
  kind: "action" | "topic";
  id: string;
  employeeId: Id<"performanceEmployees"> | null;
  employeeName: string | null;
  source: "agreement" | "kpi" | "review" | "topic";
  kpiKey: string | null;
  text: string;
  dueDate: string | null;
  tone: ReturnType<typeof dueTone>;
  checkId: Id<"performanceChecks"> | null;
  doneAt: number | null;
  doneByName: string | null;
}

/** The Monitoring tab: every counted employee with their check status and
 * history, all open items by due date, and the most recent done ones. */
export const monitoring = userQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, { companyId: companyIdArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);
    const now = today();
    const roster = await loadRoster(ctx, companyId);
    const [checks, actions] = await Promise.all([
      ctx.db
        .query("performanceChecks")
        .withIndex("by_company_date", (q) => q.eq("companyId", companyId))
        .collect(),
      ctx.db
        .query("performanceActions")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect(),
    ]);
    const topics = (
      await Promise.all(
        [...roster.names.keys()].map((employeeId) =>
          ctx.db
            .query("performanceTopics")
            .withIndex("by_employee_ym", (q) => q.eq("employeeId", employeeId))
            .collect(),
        ),
      )
    ).flat();

    const employees = [...roster.names.entries()]
      .map(([id, name]) => {
        const mine = checks
          .filter((c) => c.employeeId === id)
          .sort((a, b) => b.date.localeCompare(a.date));
        const last = mine.find((c) => c.type === "employee");
        const nextDue = last ? addDays(last.date, CHECK_INTERVAL_DAYS) : null;
        const status: "never" | "overdue" | "due" | "ok" = !last
          ? "never"
          : nextDue! < now
            ? "overdue"
            : nextDue! <= addDays(now, 7)
              ? "due"
              : "ok";
        return {
          id,
          name,
          lastEmployeeCheck: last?.date ?? null,
          nextDue,
          status,
          checks: mine.slice(0, 24).map((c) => ({
            id: c._id,
            type: c.type,
            date: c.date,
            ratings: ratingCounts(c),
          })),
          open: actions.filter((a) => a.employeeId === id && !a.doneAt).length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    const nameOf = (id: Id<"performanceEmployees"> | undefined) =>
      id ? (roster.names.get(id) ?? null) : null;
    const items: OpenItem[] = [
      ...actions
        .filter((a) => !a.employeeId || roster.names.has(a.employeeId))
        .map(
          (a): OpenItem => ({
            kind: "action",
            id: a._id,
            employeeId: a.employeeId ?? null,
            employeeName: nameOf(a.employeeId),
            source: a.source,
            kpiKey: a.kpiKey ?? null,
            text: a.text,
            dueDate: a.dueDate ?? null,
            tone: a.doneAt ? "none" : dueTone(a.dueDate, now),
            checkId: a.checkId ?? null,
            doneAt: a.doneAt ?? null,
            doneByName: a.doneByName ?? null,
          }),
        ),
      ...topics.map(
        (t): OpenItem => ({
          kind: "topic",
          id: t._id,
          employeeId: t.employeeId,
          employeeName: nameOf(t.employeeId),
          source: "topic",
          kpiKey: null,
          text: t.todo ? `${t.topic} – ${t.todo}` : t.topic,
          dueDate: t.endDate ?? null,
          tone: t.status === "offen" ? dueTone(t.endDate, now) : "none",
          checkId: null,
          doneAt: t.status === "offen" ? null : t.updatedAt,
          doneByName: null,
        }),
      ),
    ];
    const open = items
      .filter((i) => i.doneAt === null)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const done = items
      .filter((i) => i.doneAt !== null)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
      .slice(0, 100);

    return { today: now, employees, open, done };
  },
});
