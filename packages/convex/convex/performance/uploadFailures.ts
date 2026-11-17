/**
 * Failed report uploads, recorded by the upload page with the message the
 * uploader saw, and listed there for every admin — so a report that never
 * arrived can be explained after the fact.
 */
import { ConvexError, v } from "convex/values";

import {
  internalMutation,
  internalQuery,
  serverMutation,
  userMutation,
  userQuery,
} from "../functions";
import { type Doc } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { displayName } from "../lib/users";

/** How far back the upload page lists failures. */
export const FAILURE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_LISTED = 20;
const MAX_MESSAGE = 1000;
const MAX_FILENAME = 200;

export const record = userMutation({
  role: "admin",
  args: {
    companyId: v.id("companies"),
    filename: v.string(),
    fileSize: v.optional(v.number()),
    message: v.string(),
  },
  handler: async (ctx, { companyId, filename, fileSize, message }): Promise<void> => {
    if (!(await ctx.db.get(companyId))) {
      throw new ConvexError({ code: "not_found", message: "Dashboard nicht gefunden." });
    }
    const now = Date.now();
    // The upload service already kept this failure with its file (17.11.):
    // the page's own report of the same failure only fills in the message.
    const kept = (
      await ctx.db
        .query("performanceUploadFailures")
        .withIndex("by_company_at", (q) => q.eq("companyId", companyId).gte("at", now - 5 * 60_000))
        .collect()
    ).find((r) => r.storageId && r.filename === filename.slice(0, MAX_FILENAME));
    if (kept) return;
    await ctx.db.insert("performanceUploadFailures", {
      companyId,
      filename: filename.slice(0, MAX_FILENAME),
      fileSize,
      message: (message.trim() || "Upload fehlgeschlagen.").slice(0, MAX_MESSAGE),
      uploadedBy: displayName(ctx.caller.user),
      at: now,
    });
    // Old entries are of no use; drop them as new ones come in.
    const stale = await ctx.db
      .query("performanceUploadFailures")
      .withIndex("by_company_at", (q) =>
        q.eq("companyId", companyId).lt("at", now - FAILURE_WINDOW_MS),
      )
      .take(50);
    for (const row of stale) await dropFailure(ctx, row);
  },
});

async function dropFailure(ctx: MutationCtx, row: Doc<"performanceUploadFailures">) {
  if (row.storageId) {
    // The same file may since have been imported (retry) – keep it then.
    const used = await ctx.db
      .query("performanceUploadLog")
      .filter((q) => q.eq(q.field("storageId"), row.storageId))
      .first();
    if (!used) await ctx.storage.delete(row.storageId).catch(() => {});
  }
  await ctx.db.delete(row._id);
}

/** The upload service keeps a failed import's file here, so an admin can
 * retry it from the list later – e.g. after a fix – without the file. */
export const apiRecordWithFile = serverMutation({
  args: {
    companyId: v.id("companies"),
    filename: v.string(),
    fileSize: v.optional(v.number()),
    message: v.string(),
    uploadedBy: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("performanceUploadFailures", {
      companyId: args.companyId,
      filename: args.filename.slice(0, MAX_FILENAME),
      fileSize: args.fileSize,
      message: (args.message.trim() || "Upload fehlgeschlagen.").slice(0, MAX_MESSAGE),
      uploadedBy: args.uploadedBy,
      at: Date.now(),
      storageId: args.storageId,
      contentHash: args.contentHash,
    });
  },
});

export const getForRetry = internalQuery({
  args: { failureId: v.id("performanceUploadFailures") },
  handler: async (ctx, { failureId }) => await ctx.db.get(failureId),
});

/** After a retry: success removes the entry (the file now belongs to the
 * upload log), another failure updates the message. */
export const afterRetry = internalMutation({
  args: {
    failureId: v.id("performanceUploadFailures"),
    ok: v.boolean(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { failureId, ok, message }): Promise<void> => {
    const row = await ctx.db.get(failureId);
    if (!row) return;
    if (ok) await ctx.db.delete(row._id);
    else {
      await ctx.db.patch(row._id, {
        message: (message?.trim() || row.message).slice(0, MAX_MESSAGE),
        at: Date.now(),
      });
    }
  },
});

export const list = userQuery({
  role: "admin",
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const since = Date.now() - FAILURE_WINDOW_MS;
    const rows = await ctx.db
      .query("performanceUploadFailures")
      .withIndex("by_company_at", (q) => q.eq("companyId", companyId).gte("at", since))
      .order("desc")
      .take(MAX_LISTED);
    return rows.map((r) => ({
      id: r._id,
      filename: r.filename,
      fileSize: r.fileSize ?? null,
      message: r.message,
      uploadedBy: r.uploadedBy,
      at: r.at,
      canRetry: !!r.storageId,
    }));
  },
});
