import { query, userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { DEFAULT_THRESHOLDS } from "./lib/thresholds";
const severityValidator = v.union(
  v.literal("niedrig"),
  v.literal("mittel"),
  v.literal("hoch"),
  v.literal("kritisch"),
);
const statusValidator = v.union(
  v.literal("neu"),
  v.literal("in_bearbeitung"),
  v.literal("geschlossen"),
);
const feedbackValidator = v.union(v.literal("positiv"), v.literal("neutral"), v.literal("negativ"));

/** Everything, newest first — the list page does its own scope/severity/search filtering. */
export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("errorReports").collect();
    const categories = await ctx.db.query("errorCategories").collect();
    const categoryName = new Map(categories.map((c) => [c._id, c.name]));
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        _id: r._id,
        categoryId: r.categoryId ?? null,
        categoryName: r.categoryId
          ? (categoryName.get(r.categoryId) ?? null)
          : (r.categoryName ?? null),
        description: r.description,
        severity: r.severity,
        status: r.status,
        customerOrProject: r.customerOrProject ?? null,
        responsibleName: r.responsibleName ?? null,
        dueAt: r.dueAt ?? null,
        customerInformedAt: r.customerInformedAt ?? null,
        customerRespondedAt: r.customerRespondedAt ?? null,
        prevention: r.prevention ?? null,
        customerFeedback: r.customerFeedback ?? null,
        effectivenessChecked: r.effectivenessChecked,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt,
        closedAt: r.closedAt ?? null,
        updatedAt: r.updatedAt ?? null,
      }));
  },
});

/** Quick-add: description + category + severity is enough to log an error —
 * everything else (due date, status) is defaulted and refined later via `update`. */
export const create = userMutation({
  args: {
    description: v.string(),
    categoryId: v.optional(v.id("errorCategories")),
    severity: severityValidator,
    customerOrProject: v.optional(v.string()),
    responsibleName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const description = args.description.trim();
    if (!description)
      throw new ConvexError({ code: "bad_request", message: "Description required" });
    const settings = await ctx.db.query("errorSettings").first();
    const dueDays = settings?.defaultDueDays ?? DEFAULT_THRESHOLDS.defaultDueDays;
    const now = Date.now();
    const id = await ctx.db.insert("errorReports", {
      categoryId: args.categoryId,
      description,
      severity: args.severity,
      status: "neu",
      customerOrProject: args.customerOrProject?.trim() || undefined,
      responsibleName: args.responsibleName?.trim() || undefined,
      dueAt: now + dueDays * 24 * 60 * 60 * 1000,
      effectivenessChecked: false,
      createdByUserId: user._id,
      createdAt: now,
    });
    return { id };
  },
});

const updatableFields = {
  categoryId: v.optional(v.id("errorCategories")),
  description: v.optional(v.string()),
  severity: v.optional(severityValidator),
  status: v.optional(statusValidator),
  customerOrProject: v.optional(v.string()),
  responsibleName: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  customerInformedAt: v.optional(v.number()),
  customerRespondedAt: v.optional(v.number()),
  prevention: v.optional(v.string()),
  customerFeedback: v.optional(feedbackValidator),
  effectivenessChecked: v.optional(v.boolean()),
};

export const update = userMutation({
  args: { reportId: v.id("errorReports"), patch: v.object(updatableFields) },
  handler: async (ctx, { reportId, patch }) => {
    const report = await ctx.db.get(reportId);
    if (!report) throw new ConvexError({ code: "not_found", message: "Not found" });
    // Closing snapshots closedAt; reopening clears it so it doesn't read as
    // closed-then-reopened-but-still-dated.
    const closedAt =
      patch.status === undefined
        ? report.closedAt
        : patch.status === "geschlossen"
          ? (report.closedAt ?? Date.now())
          : undefined;
    await ctx.db.patch(reportId, { ...patch, closedAt, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const remove = userMutation({
  role: "manager",
  args: { reportId: v.id("errorReports") },
  handler: async (ctx, { reportId }) => {
    const measures = await ctx.db
      .query("errorMeasures")
      .withIndex("by_error", (q) => q.eq("errorReportId", reportId))
      .collect();
    for (const m of measures) await ctx.db.delete(m._id);
    await ctx.db.delete(reportId);
    return { ok: true };
  },
});
