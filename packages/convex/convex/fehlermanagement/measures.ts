import { userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { DEFAULT_THRESHOLDS } from "./lib/thresholds";
import { moveToTrash } from "../lib/trash";

const phaseValidator = v.union(
  v.literal("d3_sofort"),
  v.literal("d4_ursache"),
  v.literal("d5_d6_abstellung"),
  v.literal("d7_wirksamkeit"),
  v.literal("d8_vorbeugung"),
);
const statusValidator = v.union(v.literal("offen"), v.literal("erledigt"));
const relatedLinksValidator = v.array(
  v.object({
    type: v.union(
      v.literal("guidebook"),
      v.literal("announcement"),
      v.literal("ticket"),
      v.literal("other"),
    ),
    label: v.string(),
    url: v.string(),
  }),
);

async function userName(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  return user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : null;
}

function validateRelatedLinks(links: Array<{ label: string; url: string }>) {
  if (links.length > 5) {
    throw new ConvexError({ code: "bad_request", message: "At most five related links" });
  }
  for (const link of links) {
    if (!link.label.trim() || !link.url.trim()) {
      throw new ConvexError({ code: "bad_request", message: "Related links need a label and URL" });
    }
    if (link.url.startsWith("/")) continue;
    try {
      const parsed = new URL(link.url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      throw new ConvexError({ code: "bad_request", message: "Related link URL is invalid" });
    }
  }
}

/** All 8D-PDCA measures, newest first. `errorReportId` narrows to one error. */
export const list = userQuery({
  args: { errorReportId: v.optional(v.id("errorReports")) },
  handler: async (ctx, { errorReportId }) => {
    const rows = errorReportId
      ? await ctx.db
          .query("errorMeasures")
          .withIndex("by_error", (q) => q.eq("errorReportId", errorReportId))
          .collect()
      : await ctx.db.query("errorMeasures").collect();
    return Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (m) => ({
          _id: m._id,
          errorReportId: m.errorReportId,
          description: m.description,
          phase: m.phase,
          status: m.status,
          responsibleName: m.responsibleName ?? null,
          ownerUserId: m.ownerUserId ?? null,
          ownerName: m.ownerUserId ? await userName(ctx, m.ownerUserId) : null,
          relatedLinks: m.relatedLinks ?? [],
          dueAt: m.dueAt ?? null,
          effectivenessChecked: m.effectivenessChecked,
          createdByUserId: m.createdByUserId,
          createdAt: m.createdAt,
          completedAt: m.completedAt ?? null,
        })),
    );
  },
});

/** Same-category error reports in the 30 days before a measure was completed
 * versus the 30 days after — a quick read on whether it worked. */
export const effectiveness = userQuery({
  args: { measureId: v.id("errorMeasures") },
  handler: async (ctx, { measureId }) => {
    const measure = await ctx.db.get(measureId);
    if (!measure?.completedAt) return null;
    const report = await ctx.db.get(measure.errorReportId);
    if (!report) return null;
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    const start = measure.completedAt - windowMs;
    const end = measure.completedAt + windowMs;
    const rows = await ctx.db
      .query("errorReports")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", start).lt("createdAt", end))
      .collect();
    const sameCategory = rows.filter((r) =>
      report.categoryId
        ? r.categoryId === report.categoryId
        : r.categoryName === report.categoryName,
    );
    return {
      categoryName: report.categoryName ?? null,
      before: sameCategory.filter((r) => r.createdAt < measure.completedAt!).length,
      after: sameCategory.filter((r) => r.createdAt >= measure.completedAt!).length,
      windowDone: Date.now() >= end,
    };
  },
});

/** Open measures the caller owns, earliest due first. */
export const listMineOpen = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const rows = await ctx.db
      .query("errorMeasures")
      .withIndex("by_status", (q) => q.eq("status", "offen"))
      .collect();
    return rows
      .filter((m) => m.ownerUserId === user._id)
      .sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))
      .map((m) => ({
        _id: m._id,
        errorReportId: m.errorReportId,
        description: m.description,
        dueAt: m.dueAt ?? null,
      }));
  },
});

export const create = userMutation({
  args: {
    errorReportId: v.id("errorReports"),
    description: v.string(),
    phase: phaseValidator,
    responsibleName: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    relatedLinks: v.optional(relatedLinksValidator),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const description = args.description.trim();
    if (!description)
      throw new ConvexError({ code: "bad_request", message: "Description required" });
    const report = await ctx.db.get(args.errorReportId);
    if (!report) throw new ConvexError({ code: "not_found", message: "Error report not found" });
    if (args.ownerUserId) {
      const owner = await ctx.db.get(args.ownerUserId);
      if (!owner || owner.status !== "active") {
        throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
      }
    }
    if (args.relatedLinks) validateRelatedLinks(args.relatedLinks);
    const settings = await ctx.db.query("errorSettings").first();
    const dueDays = settings?.defaultMeasureDueDays ?? DEFAULT_THRESHOLDS.defaultMeasureDueDays;
    const now = Date.now();
    const id = await ctx.db.insert("errorMeasures", {
      errorReportId: args.errorReportId,
      description,
      phase: args.phase,
      status: "offen",
      responsibleName: args.responsibleName?.trim() || undefined,
      ownerUserId: args.ownerUserId,
      relatedLinks: args.relatedLinks,
      dueAt: args.dueAt ?? now + dueDays * 24 * 60 * 60 * 1000,
      effectivenessChecked: false,
      createdByUserId: user._id,
      createdAt: now,
    });
    return { id };
  },
});

export const update = userMutation({
  args: {
    measureId: v.id("errorMeasures"),
    patch: v.object({
      description: v.optional(v.string()),
      phase: v.optional(phaseValidator),
      status: v.optional(statusValidator),
      responsibleName: v.optional(v.string()),
      ownerUserId: v.optional(v.id("users")),
      relatedLinks: v.optional(relatedLinksValidator),
      dueAt: v.optional(v.number()),
      effectivenessChecked: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { measureId, patch }) => {
    const measure = await ctx.db.get(measureId);
    if (!measure) throw new ConvexError({ code: "not_found", message: "Not found" });
    if (patch.ownerUserId) {
      const owner = await ctx.db.get(patch.ownerUserId);
      if (!owner || owner.status !== "active") {
        throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
      }
    }
    if (patch.relatedLinks) validateRelatedLinks(patch.relatedLinks);
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

export const remove = userMutation({
  role: "manager",
  args: { measureId: v.id("errorMeasures") },
  handler: async (ctx, { measureId }) => {
    await moveToTrash(ctx, "errorMeasures", measureId, ctx.caller.id);
    return { ok: true };
  },
});

export const addDocument = userMutation({
  args: {
    measureId: v.id("errorMeasures"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
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

export const listDocuments = userQuery({
  args: { measureId: v.id("errorMeasures") },
  handler: async (ctx, { measureId }) => {
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

export const removeDocument = userMutation({
  role: "manager",
  args: { documentId: v.id("errorMeasureDocuments") },
  handler: async (ctx, { documentId }) => {
    const document = await ctx.db.get(documentId);
    if (!document) return { ok: true };
    await ctx.storage.delete(document.storageId);
    await ctx.db.delete(documentId);
    return { ok: true };
  },
});
