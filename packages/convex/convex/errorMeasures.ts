import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { DEFAULT_THRESHOLDS } from "./errorSettings";
import { requireManager, requireUser } from "./lib/auth";

const phaseValidator = v.union(
  v.literal("d3_sofort"),
  v.literal("d4_ursache"),
  v.literal("d5_d6_abstellung"),
  v.literal("d7_wirksamkeit"),
  v.literal("d8_vorbeugung"),
);
const statusValidator = v.union(v.literal("offen"), v.literal("erledigt"));

/** All 8D-PDCA measures, newest first. `errorReportId` narrows to one error. */
export const list = query({
  args: { errorReportId: v.optional(v.id("errorReports")) },
  handler: async (ctx, { errorReportId }) => {
    await requireUser(ctx);
    const rows = errorReportId
      ? await ctx.db
          .query("errorMeasures")
          .withIndex("by_error", (q) => q.eq("errorReportId", errorReportId))
          .collect()
      : await ctx.db.query("errorMeasures").collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({
        _id: m._id,
        errorReportId: m.errorReportId,
        description: m.description,
        phase: m.phase,
        status: m.status,
        responsibleName: m.responsibleName ?? null,
        dueAt: m.dueAt ?? null,
        effectivenessChecked: m.effectivenessChecked,
        createdByUserId: m.createdByUserId,
        createdAt: m.createdAt,
        completedAt: m.completedAt ?? null,
      }));
  },
});

export const create = mutation({
  args: {
    errorReportId: v.id("errorReports"),
    description: v.string(),
    phase: phaseValidator,
    responsibleName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const description = args.description.trim();
    if (!description) throw new ConvexError({ code: "bad_request", message: "Description required" });
    const report = await ctx.db.get(args.errorReportId);
    if (!report) throw new ConvexError({ code: "not_found", message: "Error report not found" });
    const settings = await ctx.db.query("errorSettings").first();
    const dueDays = settings?.defaultMeasureDueDays ?? DEFAULT_THRESHOLDS.defaultMeasureDueDays;
    const now = Date.now();
    const id = await ctx.db.insert("errorMeasures", {
      errorReportId: args.errorReportId,
      description,
      phase: args.phase,
      status: "offen",
      responsibleName: args.responsibleName?.trim() || undefined,
      dueAt: now + dueDays * 24 * 60 * 60 * 1000,
      effectivenessChecked: false,
      createdByUserId: user._id,
      createdAt: now,
    });
    return { id };
  },
});

export const update = mutation({
  args: {
    measureId: v.id("errorMeasures"),
    patch: v.object({
      description: v.optional(v.string()),
      phase: v.optional(phaseValidator),
      status: v.optional(statusValidator),
      responsibleName: v.optional(v.string()),
      dueAt: v.optional(v.number()),
      effectivenessChecked: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { measureId, patch }) => {
    await requireUser(ctx);
    const measure = await ctx.db.get(measureId);
    if (!measure) throw new ConvexError({ code: "not_found", message: "Not found" });
    const completedAt =
      patch.status === undefined
        ? measure.completedAt
        : patch.status === "erledigt"
          ? (measure.completedAt ?? Date.now())
          : undefined;
    await ctx.db.patch(measureId, { ...patch, completedAt });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { measureId: v.id("errorMeasures") },
  handler: async (ctx, { measureId }) => {
    await requireManager(ctx);
    await ctx.db.delete(measureId);
    return { ok: true };
  },
});
