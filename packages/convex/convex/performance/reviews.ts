/**
 * Monthly business review (BR) of a dashboard: every KPI per employee for
 * the month with previous month (VM) and previous year (VJ), the month's
 * checks with their texts, open and done actions from the checks, and the
 * review's own entries — notes, decisions and open points. An entry that
 * isn't ticked off shows up again in every later review. Single employees
 * can be left out of a review (the team row then counts only the others).
 * Team leads and admins only.
 */
import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { userMutation, userQuery } from "../functions";
import { loadViewer, requireTeamView } from "./lib/access";
import { dueTone } from "./lib/checkKpis";
import { monthBounds, monthCompleted, shiftYm, type Snapshot } from "./lib/kpi";
import { type Cutoff, loadRoster, monthRows, newQueryCache, summarizeMonth } from "./lib/reports";
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

const entryTypeValidator = v.union(v.literal("note"), v.literal("decision"), v.literal("open"));
type EntryType = "note" | "decision" | "open";

/** A review entry's month: stored on newer ones, else its review's. */
function entryYm(
  a: Doc<"performanceActions">,
  reviewYms: ReadonlyMap<string, string>,
): string | undefined {
  return a.reviewYm ?? (a.reviewId ? reviewYms.get(a.reviewId) : undefined);
}

/** The entries a review of `ym` shows: its own, plus earlier ones still
 * open — or ticked off only after this review was started, so they don't
 * vanish from it. */
async function reviewEntries(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  ym: string,
): Promise<{ entry: Doc<"performanceActions">; fromYm: string }[]> {
  const [reviews, actions] = await Promise.all([
    ctx.db
      .query("performanceReviews")
      .withIndex("by_company_ym", (q) => q.eq("companyId", companyId))
      .collect(),
    ctx.db
      .query("performanceActions")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect(),
  ]);
  const reviewYms = new Map(reviews.map((r) => [r._id as string, r.ym]));
  const startedAt = reviews.find((r) => r.ym === ym)?.createdAt ?? Infinity;
  const out: { entry: Doc<"performanceActions">; fromYm: string }[] = [];
  for (const a of actions) {
    if (a.source !== "review") continue;
    const from = entryYm(a, reviewYms);
    if (!from || from > ym) continue;
    if (from === ym || a.doneAt === undefined || a.doneAt >= startedAt) {
      out.push({ entry: a, fromYm: from });
    }
  }
  return out.sort((x, y) => x.entry.createdAt - y.entry.createdAt);
}

export const get = userQuery({
  args: { companyId: v.optional(v.id("companies")), ym: v.optional(v.string()) },
  handler: async (ctx, { companyId: companyIdArg, ym: ymArg }) => {
    const viewer = await loadViewer(ctx, ctx.caller);
    const companyId = requireTeamView(viewer, companyIdArg);
    // A BR looks back on the previous month by default.
    const ym = ymArg && YM.test(ymArg) ? ymArg : shiftYm(currentYm(), -1);
    const now = toISODate(todayBerlin());

    const review = await ctx.db
      .query("performanceReviews")
      .withIndex("by_company_ym", (q) => q.eq("companyId", companyId).eq("ym", ym))
      .first();
    const hidden = new Set<string>(review?.hiddenEmployeeIds ?? []);

    const cache = newQueryCache();
    const roster = await loadRoster(ctx, companyId, cache);
    const shown = new Map<Id<"performanceEmployees">, string>(
      [...roster.names].filter(([id]) => !hidden.has(id)),
    );
    const summarize = async (m: string, cutoff?: Cutoff) =>
      summarizeMonth(await monthRows(ctx, companyId, m, cache), shown, m, { cutoff });

    const cur = await summarize(ym);
    // A finished month compares full months; a running one like-for-like.
    const done = monthCompleted(ym);
    const ref = (refYm: string) =>
      summarize(refYm, done ? undefined : cutoffFor(ym, refYm, cur.asOf));
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
    const [checks, actions, entries] = await Promise.all([
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
      reviewEntries(ctx, companyId, ym),
    ]);
    const names = new Map<string, string>([...roster.names]);
    const isShown = (id: Id<"performanceEmployees"> | undefined) => !id || shown.has(id);
    const monthStart = Date.parse(`${start}T00:00:00Z`);
    const monthEnd = Date.parse(`${end}T23:59:59Z`);
    const relevant = (a: Doc<"performanceActions">) =>
      a.source !== "review" &&
      isShown(a.employeeId) &&
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
      /** Everyone on the dashboard, for picking who the review shows. */
      employees: [...roster.names]
        .map(([id, name]) => ({
          id: id as Id<"performanceEmployees">,
          name,
          hidden: hidden.has(id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
      checks: checks
        .filter((c) => isShown(c.employeeId))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => ({
          id: c._id,
          employeeId: c.employeeId,
          employeeName: names.get(c.employeeId) ?? null,
          date: c.date,
          tops: c.tops,
          goFors: c.goFors,
          note: c.note ?? null,
          red: c.ratings.filter((r) => r.rating === "red").map((r) => r.key),
        })),
      actions: actions.filter(relevant).map(toItem),
      review: {
        // Read by the page from before 10/2026 while it is still open.
        notes: review?.notes ?? "",
        actions: entries.filter(({ fromYm }) => fromYm === ym).map(({ entry }) => toItem(entry)),
        updatedAt: review?.updatedAt ?? null,
        /** Free text of a review from before entries existed. */
        legacyNotes: review?.notes.trim() || null,
        entries: entries.map(({ entry, fromYm }) => ({
          ...toItem(entry),
          type: (entry.entryType ?? "open") as EntryType,
          /** Set when the entry comes from an earlier review. */
          fromYm: fromYm === ym ? null : fromYm,
          doneByName: entry.doneByName ?? null,
        })),
      },
    };
  },
});

async function reviewFor(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  ym: string,
  name: string,
): Promise<Doc<"performanceReviews">> {
  const existing = await ctx.db
    .query("performanceReviews")
    .withIndex("by_company_ym", (q) => q.eq("companyId", companyId).eq("ym", ym))
    .first();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("performanceReviews", {
    companyId,
    ym,
    notes: "",
    createdByName: name,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

/** Who the review leaves out — applied right away, no "save" needed. */
export const setHidden = userMutation({
  args: {
    companyId: v.id("companies"),
    ym: v.string(),
    hiddenEmployeeIds: v.array(v.id("performanceEmployees")),
  },
  handler: async (ctx, args): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const companyId = requireTeamView(viewer, args.companyId);
    if (!YM.test(args.ym)) throw new Error("Ungültiger Monat.");
    const review = await reviewFor(ctx, companyId, args.ym, viewer.name);
    await ctx.db.patch(review._id, {
      hiddenEmployeeIds: [...new Set(args.hiddenEmployeeIds)],
      updatedAt: Date.now(),
    });
  },
});

/** Saves the review's entries: updates the listed ones (also those
 * carried over from earlier reviews), adds new ones to this review and
 * deletes the shown ones that are gone. The old free text is cleared — the
 * page turns it into a note entry. */
export const save = userMutation({
  args: {
    companyId: v.id("companies"),
    ym: v.string(),
    entries: v.optional(
      v.array(
        v.object({
          id: v.optional(v.id("performanceActions")),
          type: entryTypeValidator,
          employeeId: v.optional(v.id("performanceEmployees")),
          text: v.string(),
          dueDate: v.optional(v.string()),
          done: v.boolean(),
        }),
      ),
    ),
    // Shape of the page before 10/2026, accepted while it is still open.
    notes: v.optional(v.string()),
    actions: v.optional(
      v.array(
        v.object({
          id: v.optional(v.id("performanceActions")),
          employeeId: v.optional(v.id("performanceEmployees")),
          text: v.string(),
          dueDate: v.optional(v.string()),
          done: v.boolean(),
        }),
      ),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const viewer = await loadViewer(ctx, ctx.caller, { ownRights: true });
    const companyId = requireTeamView(viewer, args.companyId);
    if (!YM.test(args.ym)) throw new Error("Ungültiger Monat.");
    const inputs =
      args.entries ?? (args.actions ?? []).map((a) => ({ ...a, type: "open" as const }));
    for (const e of inputs) {
      if (e.dueDate && !ISO_DATE.test(e.dueDate)) throw new Error("Ungültiges Datum.");
    }
    const now = Date.now();
    const review = await reviewFor(ctx, companyId, args.ym, viewer.name);
    await ctx.db.patch(review._id, {
      notes: args.entries ? "" : (args.notes ?? review.notes),
      updatedAt: now,
    });

    const shown = await reviewEntries(ctx, companyId, args.ym);
    const byId = new Map(shown.map(({ entry }) => [entry._id as string, entry]));
    const keep = new Set<string>();
    for (const input of inputs) {
      const text = input.text.trim();
      if (!text) continue;
      const prev = input.id ? byId.get(input.id) : undefined;
      const done = input.done
        ? { doneAt: prev?.doneAt ?? now, doneByName: prev?.doneByName ?? viewer.name }
        : { doneAt: undefined, doneByName: undefined };
      const fields = {
        text,
        entryType: input.type,
        employeeId: input.employeeId,
        dueDate: input.dueDate || undefined,
        ...done,
      };
      if (prev) {
        keep.add(prev._id);
        await ctx.db.patch(prev._id, fields);
      } else {
        await ctx.db.insert("performanceActions", {
          ...fields,
          companyId,
          source: "review",
          reviewId: review._id,
          reviewYm: args.ym,
          createdAt: now,
          createdByName: viewer.name,
        });
      }
    }
    for (const { entry } of shown) if (!keep.has(entry._id)) await ctx.db.delete(entry._id);
  },
});
