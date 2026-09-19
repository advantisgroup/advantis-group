import { mutation, query, serverMutation, userQuery, userMutation } from "./functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { getCurrentUser, requireVaultUnlocked } from "./lib/auth";
import { type Caller } from "./lib/caller";
import { type QueryCtx } from "./_generated/server";

/**
 * Issue a short-lived upload URL for chat attachments, avatars and
 * announcement files. The client POSTs the file to this URL and receives a
 * `storageId` which it then attaches to the relevant document.
 */
export const generateUploadUrl = userMutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Same as `generateUploadUrl`, but for the API server rather than a
 * signed-in browser — lets it push bytes (e.g. a OneDrive file being
 * imported into a chat attachment) straight to Convex storage without
 * round-tripping them through the browser first.
 */
export const apiGenerateUploadUrl = serverMutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

/** Shared by `getUrl`/`getUrls`: vault-gate a storage id that's an Applicant
 *  Management document, and pass everything else through untouched. */
async function resolveGatedUrl(
  ctx: QueryCtx,
  caller: Caller,
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
    if (!caller.hasApplicantAccess) return null;
    await requireVaultUnlocked(ctx, caller.id);
  }
  return ctx.storage.getUrl(storageId);
}

/** Resolve a single storage id to a served URL (null if missing). */
export const getUrl = userQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return resolveGatedUrl(ctx, ctx.caller, storageId);
  },
});

/** Resolve many storage ids at once. */
export const getUrls = userQuery({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    const entries = await Promise.all(
      storageIds.map(async (id) => [id, await resolveGatedUrl(ctx, ctx.caller, id)] as const),
    );
    return Object.fromEntries(entries) as Record<Id<"_storage">, string | null>;
  },
});

/** Long enough to cover "uploaded, then the save failed or was discarded". */
const ROLLBACK_WINDOW_MS = 60 * 60 * 1000;

/**
 * Roll back an upload that never got saved. Storage doesn't know who uploaded
 * a file, so this only reaches fresh uploads, and never HR documents — deleting
 * anything that's already part of a record happens through that record's own
 * delete, which knows who owns it.
 */
export const deleteFile = userMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const file = await ctx.db.system.get(storageId);
    if (!file) return { deleted: false };
    const isHrDocument =
      (await ctx.db
        .query("applicantDocuments")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first()) ??
      (await ctx.db
        .query("employeeDocuments")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first());
    if (isHrDocument || Date.now() - file._creationTime > ROLLBACK_WINDOW_MS) {
      throw new ConvexError({ code: "forbidden", message: "This file can't be deleted here" });
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
  ctx: { db: QueryCtx["db"] },
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
