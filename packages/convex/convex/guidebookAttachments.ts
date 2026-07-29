import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { isOwnerOrAdmin, requireCapability, requireUser } from "./lib/auth";

const attachmentFields = {
  oneDriveItemId: v.string(),
  oneDrivePath: v.string(),
  name: v.string(),
  kind: v.union(v.literal("image"), v.literal("file")),
  size: v.optional(v.number()),
  contentType: v.optional(v.string()),
};

/** Files attached to a guidebook page, newest first. The actual bytes live in
 * OneDrive — this only returns the reference (oneDriveItemId/oneDrivePath);
 * the client fetches content through apps/api's /onedrive/download/:id. */
export const list = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("guidebookAttachments")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        kind: a.kind,
        size: a.size ?? null,
        contentType: a.contentType ?? null,
        oneDriveItemId: a.oneDriveItemId,
        oneDrivePath: a.oneDrivePath,
        uploadedByUserId: a.uploadedByUserId,
        createdAt: a.createdAt,
      }));
  },
});

/** Requires the manage_guidebooks capability — records a reference to a file
 * already uploaded to OneDrive (see apps/api POST /onedrive/wiki/:slug/attach). */
export const add = mutation({
  args: { slug: v.string(), attachment: v.object(attachmentFields) },
  handler: async (ctx, { slug, attachment }) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const id = await ctx.db.insert("guidebookAttachments", {
      slug,
      ...attachment,
      uploadedByUserId: user._id,
      createdAt: Date.now(),
    });
    return { id };
  },
});

/** Drops the reference row. The caller is responsible for deleting the
 * OneDrive item itself first (DELETE /onedrive/items/:id) — this mutation
 * never touches Graph directly. */
export const remove = mutation({
  args: { attachmentId: v.id("guidebookAttachments") },
  handler: async (ctx, { attachmentId }) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const row = await ctx.db.get(attachmentId);
    if (!row) return { ok: false };
    if (!isOwnerOrAdmin(user, row.uploadedByUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the uploader or an admin can remove this",
      });
    }
    await ctx.db.delete(attachmentId);
    return { ok: true };
  },
});
