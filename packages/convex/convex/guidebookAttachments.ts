import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import { isOwnerOrAdmin, requireCapability, requireUser } from "./lib/auth";

const attachmentFields = {
  oneDriveItemId: v.string(),
  oneDrivePath: v.string(),
  name: v.string(),
  kind: v.union(v.literal("image"), v.literal("file")),
  size: v.optional(v.number()),
  contentType: v.optional(v.string()),
};

/** Files attached to a guidebook page, newest first. New rows are
 * OneDrive-backed (only the reference is returned; the client fetches
 * content through apps/api's /onedrive/download/:id). Rows from before that
 * change are still Convex-storage-backed — those get a direct `url` instead
 * so they keep working without a migration. */
export const list = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("guidebookAttachments")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    return Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (a) => ({
          _id: a._id,
          name: a.name,
          kind: a.kind,
          size: a.size ?? null,
          contentType: a.contentType ?? null,
          oneDriveItemId: a.oneDriveItemId ?? null,
          oneDrivePath: a.oneDrivePath ?? null,
          // Legacy (pre-OneDrive) rows only — null for anything uploaded
          // through the current attach flow.
          legacyUrl: a.storageId ? await ctx.storage.getUrl(a.storageId) : null,
          uploadedByUserId: a.uploadedByUserId,
          createdAt: a.createdAt,
        })),
    );
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

/** Authorizes (uploader or admin) and drops the reference row first — the
 * client only deletes the actual OneDrive item after this succeeds, so an
 * unauthorized or failed call never leaves a live file with a dangling (or
 * wrongly-removed) reference. Legacy Convex-storage rows are cleaned up
 * here directly, since Convex — not OneDrive — is the sole owner of those bytes. */
export const remove = mutation({
  args: { attachmentId: v.id("guidebookAttachments") },
  handler: async (ctx, { attachmentId }) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const row = await ctx.db.get(attachmentId);
    if (!row) return { ok: false, oneDriveItemId: null };
    if (!isOwnerOrAdmin(user, row.uploadedByUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the uploader or an admin can remove this",
      });
    }
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(attachmentId);
    return { ok: true, oneDriveItemId: row.oneDriveItemId ?? null };
  },
});
