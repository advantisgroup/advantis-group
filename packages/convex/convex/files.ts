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

function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

/**
 * Same as `generateUploadUrl`, but for the API server rather than a
 * signed-in browser — lets it push bytes (e.g. a OneDrive file being
 * imported into a chat attachment) straight to Convex storage without
 * round-tripping them through the browser first.
 */
export const apiGenerateUploadUrl = mutation({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
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

/**
 * Check if a user has access to a file based on where it's used.
 * Returns { hasAccess: true } if:
 * - File is used as a public user avatar (anyone can access)
 * - File is in an announcement the current user can view (requires auth)
 * - File is in a message in a conversation the current user is a member of (requires auth)
 * Otherwise returns { hasAccess: false }
 *
 * Note: This query works both authenticated and unauthenticated.
 * Unauthenticated users can only see public avatars.
 */
export const canAccessFile = query({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const storageCId = storageId as unknown as Id<"_storage">;

    async function granted(reason: string) {
      return { hasAccess: true as const, reason, url: await ctx.storage.getUrl(storageCId) };
    }

    // Check if used as a user avatar (public to everyone)
    const userAvatar = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("avatarStorageId"), storageCId))
      .first();
    if (userAvatar) {
      return granted("public_user_avatar");
    }

    const user = await getCurrentUser(ctx);
    if (!user) {
      return { hasAccess: false as const, reason: "not_authenticated" };
    }

    // Check if used as a conversation/group avatar
    const conversationAvatar = await ctx.db
      .query("conversations")
      .filter(q => q.eq(q.field("avatarStorageId"), storageCId))
      .first();
    if (conversationAvatar) {
      const userInConversation = await ctx.db
        .query("conversationMembers")
        .filter(
          q =>
            q.and(
              q.eq(q.field("conversationId"), conversationAvatar._id),
              q.eq(q.field("userId"), user._id)
            )
        )
        .first();
      if (userInConversation) {
        return granted("conversation_member");
      }
    }

    // Check if used in an announcement the user can view
    const announcements = await ctx.db.query("announcements").collect();

    for (const ann of announcements) {
      if (!ann.attachmentStorageIds.length && !ann.attachments?.length) continue;
      const ids = [
        ...ann.attachmentStorageIds,
        ...(ann.attachments?.map(a => a.storageId) ?? []),
      ];
      if (!ids.some(id => id === storageCId)) continue;

      const audience = ann.audience;
      let hasAccess = false;

      if (audience.kind === "all") {
        hasAccess = true;
      } else if (audience.kind === "departmentId") {
        hasAccess = user.departmentId === audience.departmentId;
      } else if (audience.kind === "department") {
        const userDept = user.departmentId
          ? await ctx.db.get(user.departmentId)
          : null;
        hasAccess = userDept ? userDept.name === audience.department : false;
      } else if (audience.kind === "users") {
        hasAccess = audience.userIds.includes(user._id);
      }

      if (hasAccess) {
        return granted("announcement_audience");
      }
    }

    // Check if used in a message in a conversation the user is a member of
    const messages = await ctx.db.query("messages").collect();

    for (const msg of messages) {
      if (!msg.attachments.length) continue;
      const ids = msg.attachments.map(a => a.storageId);
      if (!ids.some(id => id === storageCId)) continue;

      const conversation = await ctx.db.get(msg.conversationId);
      if (!conversation) continue;

      const userInConversation = await ctx.db
        .query("conversationMembers")
        .filter(
          q =>
            q.and(
              q.eq(q.field("conversationId"), conversation._id),
              q.eq(q.field("userId"), user._id)
            )
        )
        .first();

      if (userInConversation) {
        return granted("message_conversation_member");
      }
    }

    return { hasAccess: false as const, reason: "not_found_or_no_access" };
  },
});
