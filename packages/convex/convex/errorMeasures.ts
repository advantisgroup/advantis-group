import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { type QueryCtx, mutation, query } from "./_generated/server";
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

async function userName(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  return user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : null;
}

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
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const description = args.description.trim();
    if (!description)
      throw new ConvexError({ code: "bad_request", message: "Description required" });
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
      dueAt: args.dueAt ?? now + dueDays * 24 * 60 * 60 * 1000,
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

export const addDocument = mutation({
  args: {
    measureId: v.id("errorMeasures"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const measure = await ctx.db.get(args.measureId);
    if (!measure) throw new ConvexError({ code: "not_found", message: "Measure not found" });
    return ctx.db.insert("errorMeasureDocuments", {
      measureId: args.measureId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      uploadedByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const listDocuments = query({
  args: { measureId: v.id("errorMeasures") },
  handler: async (ctx, { measureId }) => {
    await requireUser(ctx);
    const measure = await ctx.db.get(measureId);
    if (!measure) throw new ConvexError({ code: "not_found", message: "Measure not found" });
    const documents = await ctx.db
      .query("errorMeasureDocuments")
      .withIndex("by_measure", (q) => q.eq("measureId", measureId))
      .collect();
    return Promise.all(
      documents
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (document) => ({
          ...document,
          uploadedByName: await userName(ctx, document.uploadedByUserId),
          url: await ctx.storage.getUrl(document.storageId),
        })),
    );
  },
});

export const removeDocument = mutation({
  args: { documentId: v.id("errorMeasureDocuments") },
  handler: async (ctx, { documentId }) => {
    await requireManager(ctx);
    const document = await ctx.db.get(documentId);
    if (!document) return { ok: true };
    await ctx.storage.delete(document.storageId);
    await ctx.db.delete(documentId);
    return { ok: true };
  },
});
