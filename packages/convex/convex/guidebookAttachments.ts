import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";
import { attachmentValidator } from "./schema";

/** Files attached to a guidebook page, newest first. */
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
          uploadedByUserId: a.uploadedByUserId,
          createdAt: a.createdAt,
          url: await ctx.storage.getUrl(a.storageId),
        })),
    );
  },
});

/** Manager+ only — attach an already-uploaded file to a guidebook page. */
export const add = mutation({
  args: { slug: v.string(), attachment: attachmentValidator },
  handler: async (ctx, { slug, attachment }) => {
    const user = await requireManager(ctx);
    const id = await ctx.db.insert("guidebookAttachments", {
      slug,
      storageId: attachment.storageId,
      name: attachment.name,
      kind: attachment.kind,
      size: attachment.size,
      contentType: attachment.contentType,
      uploadedByUserId: user._id,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const remove = mutation({
  args: { attachmentId: v.id("guidebookAttachments") },
  handler: async (ctx, { attachmentId }) => {
    const user = await requireManager(ctx);
    const row = await ctx.db.get(attachmentId);
    if (!row) return { ok: false };
    if (row.uploadedByUserId !== user._id && user.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the uploader or an admin can remove this",
      });
    }
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(attachmentId);
    return { ok: true };
  },
});
