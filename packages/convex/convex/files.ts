import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";

/**
 * Issue a short-lived upload URL for chat attachments, avatars and
 * announcement files. The client POSTs the file to this URL and receives a
 * `storageId` which it then attaches to the relevant document.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/** Resolve a single storage id to a served URL (null if missing). */
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireUser(ctx);
    return ctx.storage.getUrl(storageId);
  },
});

/** Resolve many storage ids at once. */
export const getUrls = query({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    await requireUser(ctx);
    const entries = await Promise.all(
      storageIds.map(async id => [id, await ctx.storage.getUrl(id)] as const)
    );
    return Object.fromEntries(entries) as Record<Id<"_storage">, string | null>;
  },
});

/**
 * Delete a storage object. Only the uploader's own attachments or
 * admin/manager callers may delete; enforced loosely here (any active user)
 * and tightly at the call sites that know ownership (e.g. chat.deleteMessage).
 */
export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "unauthenticated",
        message: "Not signed in",
      });
    }
    await ctx.storage.delete(storageId);
    return { deleted: true };
  },
});
