/**
 * Monthly business review (BR) of a dashboard: every KPI per employee for
 * the month with previous month (VM) and previous year (VJ), the month's
 * checks with their texts, open and done actions, and the review's own
 * notes and measures. Team leads and admins only.
 */
import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { userMutation, userQuery } from "../functions";
import { syncActions } from "./checks";
import { loadViewer, requireTeamView } from "./lib/access";
import { dueTone } from "./lib/checkKpis";
import { monthBounds, monthCompleted, shiftYm, type Snapshot } from "./lib/kpi";
import { type Cutoff, newQueryCache, teamTotals } from "./lib/reports";
import { todayBerlin, toISODate } from "./lib/workdays";
import { cutoffFor, currentYm } from "./queries";

/** The BR table's columns, in order. */
export const REVIEW_COLUMNS = [
  "leadsCreated",
  "workableCreated",
  "workableRate",
  "wonMonth",
  "hitrate",
  "wonPerDay",
  "callsToday",
  "callsPerDay",
  "talkAvgSec",
  "leadsAnalysis",
  "oppsOpen",
  "oppsOver30",
  "overduesSum",
  "leadsNoAction14",
  "oppsNoAction14",
] as const;

type Column = (typeof REVIEW_COLUMNS)[number];

function value(s: Snapshot | undefined, key: Column): number | null {
  if (!s) return null;
  if (key === "callsPerDay") {
    return s.callsToday !== undefined && s.callDays
      ? Math.round((s.callsToday / s.callDays) * 10) / 10
      : null;
  }
  const v = s[key];
  return typeof v === "number" ? v : null;
}

function values(s: Snapshot | undefined): Record<Column, number | null> {
  return Object.fromEntries(REVIEW_COLUMNS.map((k) => [k, value(s, k)])) as Record<
    Column,
    number | null
  >;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

export const get = userQuery({
  args: { companyId: v.optional(v.id("companies")), ym: v.optional(v.string()) },
  handler: async (ctx, { companyId: companyIdArg, ym: ymArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);
    // A BR looks back on the previous month by default.
    const ym = ymArg && YM.test(ymArg) ? ymArg : shiftYm(currentYm(), -1);
    const now = toISODate(todayBerlin());

    const cache = newQueryCache();
    const cur = await teamTotals(ctx, companyId, ym, cache);
    // A finished month compares full months; a running one like-for-like.
    const done = monthCompleted(ym);
    const ref = async (refYm: string) => {
      const cutoff: Cutoff | undefined = done ? undefined : cutoffFor(ym, refYm, cur.asOf);
      return teamTotals(ctx, companyId, refYm, cache, cutoff);
    };
    const [vm, vj] = await Promise.all([ref(shiftYm(ym, -1)), ref(shiftYm(ym, -12))]);
    const find = (snaps: Snapshot[], id: string) => snaps.find((s) => s.employeeId === id);

    const rows = cur.snaps.map((s) => ({
      employeeId: s.employeeId as Id<"performanceEmployees">,
      name: s.name,
      cur: values(s),
      vm: values(find(vm.snaps, s.employeeId)),
      vj: values(find(vj.snaps, s.employeeId)),
    }));
    const total = {
      cur: values(cur.total),
      vm: values(vm.snaps.length ? vm.total : undefined),
      vj: values(vj.snaps.length ? vj.total : undefined),
    };

    const { start, end } = monthBounds(ym);
    const [checks, actions, review] = await Promise.all([
      ctx.db
        .query("performanceChecks")
        .withIndex("by_company_date", (q) =>
          q.eq("companyId", companyId).gte("date", start).lte("date", end),
        )
        .collect(),
      ctx.db
        .query("performanceActions")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect(),
      ctx.db
        .query("performanceReviews")
        .withIndex("by_company_ym", (q) => q.eq("companyId", companyId).eq("ym", ym))
        .first(),
    ]);
    const names = new Map(rows.map((r) => [r.employeeId as string, r.name]));
    const monthStart = Date.parse(`${start}T00:00:00Z`);
    const monthEnd = Date.parse(`${end}T23:59:59Z`);
    const relevant = (a: Doc<"performanceActions">) =>
      a.source !== "review" &&
      // Still open, or created/done during the month.
      (!a.doneAt ||
        (a.createdAt >= monthStart && a.createdAt <= monthEnd) ||
        (a.doneAt >= monthStart && a.doneAt <= monthEnd));
    const toItem = (a: Doc<"performanceActions">) => ({
      id: a._id,
      employeeId: a.employeeId ?? null,
      employeeName: a.employeeId ? (names.get(a.employeeId) ?? null) : null,
      source: a.source,
      kpiKey: a.kpiKey ?? null,
      text: a.text,
      dueDate: a.dueDate ?? null,
      done: a.doneAt !== undefined,
      tone: a.doneAt ? ("none" as const) : dueTone(a.dueDate, now),
    });

    return {
      ym,
      monthDone: done,
      columns: REVIEW_COLUMNS,
      rows,
      total,
      checks: checks
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => ({
          id: c._id,
          employeeId: c.employeeId,
          employeeName: names.get(c.employeeId) ?? null,
          type: c.type,
          date: c.date,
          tops: c.tops,
          goFors: c.goFors,
          note: c.note ?? null,
          red: c.ratings.filter((r) => r.rating === "red").map((r) => r.key),
        })),
      actions: actions.filter(relevant).map(toItem),
      review: {
        notes: review?.notes ?? "",
        updatedAt: review?.updatedAt ?? null,
        actions: review ? actions.filter((a) => a.reviewId === review._id).map(toItem) : [],
      },
    };
  },
});

export const save = userMutation({
  args: {
    companyId: v.id("companies"),
    ym: v.string(),
    notes: v.string(),
    actions: v.array(
      v.object({
        id: v.optional(v.id("performanceActions")),
        employeeId: v.optional(v.id("performanceEmployees")),
        text: v.string(),
        dueDate: v.optional(v.string()),
        done: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const companyId = requireTeamView(viewer, args.companyId);
    if (!YM.test(args.ym)) throw new Error("Ungültiger Monat.");
    for (const a of args.actions) {
      if (a.dueDate && !ISO_DATE.test(a.dueDate)) throw new Error("Ungültiges Datum.");
    }
    const now = Date.now();
    let review = await ctx.db
      .query("performanceReviews")
      .withIndex("by_company_ym", (q) => q.eq("companyId", companyId).eq("ym", args.ym))
      .first();
    if (review) {
      await ctx.db.patch(review._id, { notes: args.notes, updatedAt: now });
    } else {
      const id = await ctx.db.insert("performanceReviews", {
        companyId,
        ym: args.ym,
        notes: args.notes,
        createdByName: viewer.name,
        createdAt: now,
        updatedAt: now,
      });
      review = (await ctx.db.get(id))!;
    }
    const existing = await ctx.db
      .query("performanceActions")
      .withIndex("by_review", (q) => q.eq("reviewId", review._id))
      .collect();
    // Review measures may name an employee each; sync them one employee
    // group at a time so `base.employeeId` stays right.
    const groups = new Map<string, typeof args.actions>();
    for (const a of args.actions) {
      const key = a.employeeId ?? "";
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    const seen = new Set<string>();
    for (const [key, inputs] of groups) {
      const employeeId = (key || undefined) as Id<"performanceEmployees"> | undefined;
      const mine = existing.filter((a) => (a.employeeId ?? "") === key);
      // An action moved to another employee is re-created under the new one.
      const moved = inputs.filter((i) => i.id && !mine.some((a) => a._id === i.id));
      for (const m of moved) delete m.id;
      mine.forEach((a) => seen.add(a._id));
      await syncActions(
        ctx,
        mine,
        inputs,
        {
          companyId,
          employeeId,
          source: "review",
          reviewId: review._id,
          createdByName: viewer.name,
        },
        viewer.name,
      );
    }
    for (const a of existing) if (!seen.has(a._id)) await ctx.db.delete(a._id);
  },
});
