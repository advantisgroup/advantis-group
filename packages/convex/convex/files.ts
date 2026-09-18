import { mutation, query } from "./functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import {
  assertServerKey,
  getCurrentUser,
  hasApplicantAccess,
  requireUser,
  requireVaultUnlocked,
} from "./lib/auth";

/**
 * Issue a short-lived upload URL for chat attachments, avatars and
 * announcement files. The client POSTs the file to this URL and receives a
 * `storageId` which it then attaches to the relevant document.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

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

/** Shared by `getUrl`/`getUrls`: vault-gate a storage id that's an Applicant
 *  Management document, and pass everything else through untouched. */
async function resolveGatedUrl(
  ctx: import("./_generated/server").QueryCtx,
  user: Doc<"users">,
  storageId: Id<"_storage">,
): Promise<string | null> {
  const applicantDocument = await ctx.db
    .query("applicantDocuments")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  const employeeDocument = await ctx.db
    .query("employeeDocuments")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (applicantDocument || employeeDocument) {
    if (!hasApplicantAccess(user)) return null;
    await requireVaultUnlocked(ctx, user._id);
  }
  return ctx.storage.getUrl(storageId);
}

/** Resolve a single storage id to a served URL (null if missing). */
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    return resolveGatedUrl(ctx, user, storageId);
  },
});

/** Resolve many storage ids at once. */
export const getUrls = query({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    const user = await requireUser(ctx);
    const entries = await Promise.all(
      storageIds.map(async (id) => [id, await resolveGatedUrl(ctx, user, id)] as const),
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

/** Whether `user` can view an announcement, mirroring `canAccessFile`'s
 *  original inline check. */
function userCanViewAnnouncement(
  user: { _id: Id<"users">; departmentId?: Id<"departments"> },
  userDept: { name: string } | null,
  audience: {
    kind: "all" | "departmentId" | "department" | "users" | "mixed";
    departmentId?: Id<"departments"> | null;
    department?: string;
    userIds?: Id<"users">[];
    departments?: string[];
  },
): boolean {
  if (audience.kind === "all") return true;
  if (audience.kind === "departmentId") return user.departmentId === audience.departmentId;
  if (audience.kind === "department")
    return userDept ? userDept.name === audience.department : false;
  if (audience.kind === "users") return (audience.userIds ?? []).includes(user._id);
  if (audience.kind === "mixed") {
    if ((audience.userIds ?? []).includes(user._id)) return true;
    return userDept
      ? (audience.departments ?? []).some((d) => d.toLowerCase() === userDept.name.toLowerCase())
      : false;
  }
  return false;
}

async function isConversationMember(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<boolean> {
  const row = await ctx.db
    .query("conversationMembers")
    .withIndex("by_user_conversation", (q) =>
      q.eq("userId", userId).eq("conversationId", conversationId),
    )
    .unique();
  return row !== null;
}

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
      return {
        hasAccess: true as const,
        reason,
        url: await ctx.storage.getUrl(storageCId),
      };
    }

    // Check if used as a user avatar (public to everyone)
    const userAvatar = await ctx.db
      .query("users")
      .withIndex("by_avatarStorageId", (q) => q.eq("avatarStorageId", storageCId))
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
      .withIndex("by_avatarStorageId", (q) => q.eq("avatarStorageId", storageCId))
      .first();
    if (conversationAvatar) {
      if (await isConversationMember(ctx, conversationAvatar._id, user._id)) {
        return granted("conversation_member");
      }
    }

    // Fast path: an indexed point lookup instead of scanning every message
    // and announcement ever created org-wide. Only rows written after
    // attachmentOwners existed are indexed (see the schema comment) — an
    // empty result here doesn't yet mean "no access", just "check the slow
    // path", which the pre-migration fallback below still does in full.
    const owners = await ctx.db
      .query("attachmentOwners")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageCId))
      .collect();

    if (owners.length > 0) {
      let userDept: { name: string } | null = null;
      for (const owner of owners) {
        if (owner.kind === "announcement" && owner.announcementId) {
          const ann = await ctx.db.get(owner.announcementId);
          if (!ann) continue;
          if (
            (ann.audience.kind === "department" || ann.audience.kind === "mixed") &&
            userDept === null
          ) {
            userDept = user.departmentId ? await ctx.db.get(user.departmentId) : null;
          }
          if (userCanViewAnnouncement(user, userDept, ann.audience)) {
            return granted("announcement_audience");
          }
        } else if (owner.kind === "message" && owner.conversationId) {
          if (await isConversationMember(ctx, owner.conversationId, user._id)) {
            return granted("message_conversation_member");
          }
        }
      }
      return { hasAccess: false as const, reason: "not_found_or_no_access" };
    }

    // Slow path fallback for attachments written before attachmentOwners
    // existed. Self-healing isn't possible here the way lastSample/todayStats
    // are (nothing re-touches an old message/announcement on its own), so
    // this stays in place rather than being removed once the index is live.
    const announcements = await ctx.db.query("announcements").collect();
    for (const ann of announcements) {
      if (!ann.attachmentStorageIds.length && !ann.attachments?.length) continue;
      const ids = [
        ...ann.attachmentStorageIds,
        ...(ann.attachments?.map((a) => a.storageId) ?? []),
      ];
      if (!ids.some((id) => id === storageCId)) continue;

      const userDept = user.departmentId ? await ctx.db.get(user.departmentId) : null;
      if (userCanViewAnnouncement(user, userDept, ann.audience)) {
        return granted("announcement_audience");
      }
    }

    const messages = await ctx.db.query("messages").collect();
    for (const msg of messages) {
      if (!msg.attachments.length) continue;
      const ids = msg.attachments.map((a) => a.storageId);
      if (!ids.some((id) => id === storageCId)) continue;

      if (await isConversationMember(ctx, msg.conversationId, user._id)) {
        return granted("message_conversation_member");
      }
    }

    return { hasAccess: false as const, reason: "not_found_or_no_access" };
  },
});
