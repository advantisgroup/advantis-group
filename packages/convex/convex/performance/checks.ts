/**
 * Employee checks (monthly, required), KPI checks (optional) and their
 * actions, plus the Monitoring tab — written by team leads and admins. KPI
 * list and week maths in `lib/checkKpis.ts`.
 *
 * Since 11/2026 sales employees see their own checks read-only under "Meine
 * Ziele" (`mine`): ratings, agreements and measures, never the business
 * review. They can't tick anything off themselves — they report it done
 * (`reportDone`) and the lead confirms or sends it back — and they confirm
 * a check's agreements digitally (`acknowledge`).
 *
 * The old "Topics" are superseded by the agreements here; existing open
 * topics still show up in Monitoring (read from `performanceTopics`) so
 * nothing gets lost.
 */
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { createNotification, notifyUsers } from "../lib/notify";
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
} from "./lib/checkKpis";
import { parseReasons, shiftYm, type Snapshot } from "./lib/kpi";
import {
  countsOnDashboard,
  type Cutoff,
  loadRoster,
  monthRows,
  newQueryCache,
  summarizeMonth,
  teamTotals,
} from "./lib/reports";
import { cockpitTeam, dashboardKind } from "./lib/roster";
import { isWorkday, parseISODate, todayBerlin, toISODate } from "./lib/workdays";
import { cutoffFor, employeeReference } from "./queries";

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

/** The check's KPI figures for one employee as of `date` (default and at
 * most today) — a check entered afterwards gets the figures of its own day:
 * month to date, VM/VJ to the same workday, and the 7 days up to it. */
export async function liveCheckKpis(
  ctx: Ctx,
  companyId: Id<"companies">,
  employee: Doc<"performanceEmployees">,
  date?: string,
): Promise<CheckKpis> {
  const now = date && ISO_DATE.test(date) && date < today() ? date : today();
  const backdated = now < today();
  const ym = now.slice(0, 7);
  // Nothing measured after the check's day counts.
  const dayCut: Cutoff | undefined = backdated ? { sales: now, calls: now } : undefined;
  const cache = newQueryCache();
  const team = await teamTotals(ctx, companyId, ym, cache, dayCut);

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
      coverage: m === ym && (!cutoff || cutoff === dayCut) ? team.coverage : null,
    }).snaps[0];
  const reference = async (refYm: string): Promise<Snapshot | undefined> => {
    if (!byMonth.has(refYm)) return undefined;
    const cutoff = cutoffFor(ym, refYm, team.asOf);
    const cut = summarize(refYm, cutoff);
    if (!cutoff) return cut;
    // A reference month without a report near the cutoff is recounted by
    // date (see `lib/referenceFix.ts`).
    const teamCut = await teamTotals(ctx, companyId, refYm, cache, cutoff);
    const ref = await employeeReference(ctx, companyId, refYm, employee.name, {
      cut,
      full: summarize(refYm),
      cutoff,
      salesAsOf: teamCut.asOf.sales,
    });
    return ref.cut;
  };
  const cur = summarize(ym, dayCut);
  const vm = await reference(shiftYm(ym, -1));
  const vj = await reference(shiftYm(ym, -12));

  // The 7 days up to the newest data (at most the check's day).
  const newest = [team.asOf.sales, team.asOf.calls]
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  const asOf = newest && newest < now ? newest : now;
  const start = addDays(asOf, -6);

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
  // The raw leads are today's; a check for an earlier day takes the
  // figure its own report had.
  const analysis30 = backdated
    ? (cur?.overduesAnalysis ?? null)
    : leads.length
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

/** Figures for a new check as of its day (`date`, default today). */
export const liveKpis = userQuery({
  args: { employeeId: v.id("performanceEmployees"), date: v.optional(v.string()) },
  handler: async (ctx, { employeeId, date }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const { employee, companyId } = await requireCheckAccess(ctx, viewer, employeeId);
    return {
      employee: { id: employee._id, name: employee.name },
      kind: dashboardKind(await ctx.db.get(companyId)),
      kpis: await liveCheckKpis(ctx, companyId, employee, date),
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
    // Every check counts: KPI checks were folded into the one
    // "Mitarbeiter-Check" (10/2026), older ones keep `type: "kpi"`.
    const last = checks[0];
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
        done: actions.filter((a) => a.checkId === c._id && a.doneAt).length,
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
          reportedAt: a.reportedAt ?? null,
          reportedByName: a.reportedByName ?? null,
          reportNote: a.reportNote ?? null,
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
    /** Ignored: there is one kind of check now (kept so an open page from
     * before 10/2026 can still save). */
    type: v.optional(v.union(v.literal("employee"), v.literal("kpi"))),
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
      type: "employee" as const,
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
      // A check moved to another day takes that day's figures.
      await ctx.db.patch(checkId, {
        ...fields,
        ...(check.date !== args.date
          ? { kpis: await liveCheckKpis(ctx, companyId, employee, args.date) }
          : {}),
      });
    } else {
      checkId = await ctx.db.insert("performanceChecks", {
        ...fields,
        companyId,
        employeeId: employee._id,
        kpis: await liveCheckKpis(ctx, companyId, employee, args.date),
        createdBy: viewer.userId,
        createdByName: actor,
        createdAt: now,
      });
      if (employee.userId && employee.userId !== viewer.userId) {
        await createNotification(ctx, {
          userId: employee.userId,
          type: "performance_check",
          title: "Neuer Mitarbeiter-Check",
          body: `${actor} hat einen Check vom ${fmtDe(args.date)} angelegt – bitte die Vereinbarungen ansehen und bestätigen.`,
          link: `/performance/mitarbeiter/${employee._id}/ziele`,
        });
      }
    }

    const existing = await ctx.db
      .query("performanceActions")
      .withIndex("by_check", (q) => q.eq("checkId", checkId))
      .collect();
    // Agreements and per-KPI measures are synced as two groups, each with
    // its own source.
    for (const kpi of [false, true]) {
      await syncActions(
        ctx,
        existing.filter((a) => !!a.kpiKey === kpi),
        args.actions.filter((a) => !!a.kpiKey === kpi),
        {
          companyId,
          employeeId: employee._id,
          source: kpi ? "kpi" : "agreement",
          checkId,
          createdByName: actor,
        },
        actor,
      );
    }
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

/** Ticks an action (agreement, KPI measure, review measure) done or open.
 * Opening it again also sends back the employee's "done" report. */
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
      ...(done ? {} : { reportedAt: undefined, reportedByName: undefined, reportNote: undefined }),
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
  /** Reported done by the employee, waiting for the lead. */
  reportedAt: number | null;
  reportNote: string | null;
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

    const todos = actions.filter((a) => a.entryType !== "note" && a.entryType !== "decision");
    const employees = [...roster.names.entries()]
      .map(([id, name]) => {
        const mine = checks
          .filter((c) => c.employeeId === id)
          .sort((a, b) => b.date.localeCompare(a.date));
        const last = mine[0];
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
          open: todos.filter((a) => a.employeeId === id && !a.doneAt).length,
          done: todos.filter((a) => a.employeeId === id && a.doneAt).length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    const nameOf = (id: Id<"performanceEmployees"> | undefined) =>
      id ? (roster.names.get(id) ?? null) : null;
    const items: OpenItem[] = [
      ...actions
        // Notes and decisions of a business review aren't to-dos.
        .filter((a) => a.entryType !== "note" && a.entryType !== "decision")
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
            reportedAt: a.doneAt ? null : (a.reportedAt ?? null),
            reportNote: a.doneAt ? null : (a.reportNote ?? null),
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
          reportedAt: null,
          reportNote: null,
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

// ------------------------------------------------------- employee's own view

function fmtDe(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** The viewer's own employee row on a sales dashboard. Admins previewing
 * with "Ansicht als" read as the person; writes (`ownRights`) never pass. */
async function requireOwnEmployee(
  ctx: Ctx,
  viewer: PerformanceViewer,
  employeeId: Id<"performanceEmployees">,
): Promise<Doc<"performanceEmployees">> {
  const employee = await ctx.db.get(employeeId);
  if (!employee?.companyId || employee.userId !== viewer.userId || !countsOnDashboard(employee)) {
    throw notFound("Mitarbeiter nicht gefunden.");
  }
  if (!viewer.dashboards.some((d) => d.companyId === employee.companyId && d.kind === "sales")) {
    throw notFound("Mitarbeiter nicht gefunden.");
  }
  return employee;
}

/** Who leads a dashboard: the heads of its linked departments and, for a
 * cockpit dashboard, the cockpit's leads. */
async function dashboardLeadUserIds(
  ctx: MutationCtx,
  companyId: Id<"companies">,
): Promise<Id<"users">[]> {
  const company = await ctx.db.get(companyId);
  if (!company) return [];
  const ids = new Set<Id<"users">>();
  for (const depId of company.departmentIds ?? []) {
    const dep = await ctx.db.get(depId);
    if (dep && !dep.archivedAt && dep.reportsToUserId) ids.add(dep.reportsToUserId);
  }
  if (company.onboardingCockpit) for (const id of (await cockpitTeam(ctx)).leads) ids.add(id);
  return [...ids];
}

/** "Meine Ziele": the employee's own checks with ratings, agreements and
 * measures (read-only), newest first. Business reviews stay with the leads. */
export const mine = userQuery({
  args: { employeeId: v.id("performanceEmployees") },
  handler: async (ctx, { employeeId }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const employee = await requireOwnEmployee(ctx, viewer, employeeId);
    const now = today();
    const [checks, actions] = await Promise.all([
      ctx.db
        .query("performanceChecks")
        .withIndex("by_employee_date", (q) => q.eq("employeeId", employee._id))
        .order("desc")
        .take(24),
      ctx.db
        .query("performanceActions")
        .withIndex("by_employee", (q) => q.eq("employeeId", employee._id))
        .collect(),
    ]);
    const last = checks[0];
    const nextDue = last ? addDays(last.date, CHECK_INTERVAL_DAYS) : null;
    const toItem = (a: Doc<"performanceActions">) => ({
      id: a._id,
      checkId: a.checkId ?? null,
      kpiKey: a.kpiKey ?? null,
      source: a.source,
      text: a.text,
      dueDate: a.dueDate ?? null,
      tone: a.doneAt ? ("none" as const) : dueTone(a.dueDate, now),
      doneAt: a.doneAt ?? null,
      doneByName: a.doneByName ?? null,
      reportedAt: a.doneAt ? null : (a.reportedAt ?? null),
      reportNote: a.doneAt ? null : (a.reportNote ?? null),
    });
    const own = actions.filter((a) => a.checkId && a.source !== "review").map(toItem);
    return {
      today: now,
      lastCheck: last?.date ?? null,
      nextDue,
      open: own
        .filter((a) => a.doneAt === null)
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
      checks: checks.map((c) => ({
        id: c._id,
        date: c.date,
        createdByName: c.createdByName,
        kpis: c.kpis,
        ratings: c.ratings,
        tops: c.tops,
        goFors: c.goFors,
        note: c.note ?? null,
        acknowledgedAt: c.acknowledgedAt ?? null,
        acknowledgedByName: c.acknowledgedByName ?? null,
        changedSinceAck: c.acknowledgedAt !== undefined && c.updatedAt > c.acknowledgedAt,
        actions: own.filter((a) => a.checkId === c._id),
      })),
    };
  },
});

/** The employee reports an agreement or measure done (or takes the report
 * back). Ticking it off stays with the lead, who gets a notification. */
export const reportDone = userMutation({
  args: {
    actionId: v.id("performanceActions"),
    reported: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { actionId, reported, note }): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const action = await ctx.db.get(actionId);
    if (!action?.employeeId || !action.checkId || action.source === "review") {
      throw notFound("Aufgabe nicht gefunden.");
    }
    const employee = await requireOwnEmployee(ctx, viewer, action.employeeId);
    if (action.doneAt) throw invalid("Die Aufgabe ist schon abgehakt.");
    if (!reported) {
      await ctx.db.patch(actionId, {
        reportedAt: undefined,
        reportedByName: undefined,
        reportNote: undefined,
      });
      return;
    }
    await ctx.db.patch(actionId, {
      reportedAt: Date.now(),
      reportedByName: viewer.name,
      reportNote: note?.trim().slice(0, 500) || undefined,
    });
    const leads = (await dashboardLeadUserIds(ctx, action.companyId)).filter(
      (id) => id !== viewer.userId,
    );
    await notifyUsers(ctx, leads, {
      type: "performance_report",
      title: `${employee.name} meldet: erledigt`,
      body: action.text,
      link: `/performance/mitarbeiter/${employee._id}/checks/${action.checkId}`,
    });
  },
});

/** The employee confirms a check's agreements ("gelesen und einverstanden"). */
export const acknowledge = userMutation({
  args: { checkId: v.id("performanceChecks") },
  handler: async (ctx, { checkId }): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const check = await ctx.db.get(checkId);
    if (!check) throw notFound("Check nicht gefunden.");
    await requireOwnEmployee(ctx, viewer, check.employeeId);
    // Confirming again after the lead changed the check renews the stamp.
    if (check.acknowledgedAt !== undefined && check.updatedAt <= check.acknowledgedAt) return;
    await ctx.db.patch(checkId, { acknowledgedAt: Date.now(), acknowledgedByName: viewer.name });
  },
});
