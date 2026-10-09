/**
 * Failed report uploads, recorded by the upload page with the message the
 * uploader saw, and listed there for every admin — so a report that never
 * arrived can be explained after the fact.
 */
import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";
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
    for (const row of stale) await ctx.db.delete(row._id);
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
    }));
  },
});
