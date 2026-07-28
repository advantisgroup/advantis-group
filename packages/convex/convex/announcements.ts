import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { assertAttachmentSizeOk } from "./lib/attachments";
import { requireManager, requireUser } from "./lib/auth";
import { type Audience, userMatchesAudience } from "./lib/audience";
import { notifyUsers } from "./lib/notify";
import { displayName } from "./lib/users";
import { attachmentValidator, audienceValidator } from "./schema";

function aggregateReactions(
  rows: { emoji: string; userId: Id<"users"> }[],
  meId: Id<"users">,
): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const entry = map.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.userId === meId) entry.mine = true;
    map.set(r.emoji, entry);
  }
  return [...map.entries()].map(([emoji, e]) => ({
    emoji,
    count: e.count,
    mine: e.mine,
  }));
}

/** The author and admins can always see an announcement, regardless of audience. */
function isVisibleToUser(user: Doc<"users">, a: Doc<"announcements">): boolean {
  return (
    a.authorUserId === user._id || user.role === "admin" || userMatchesAudience(user, a.audience)
  );
}

async function resolveAudienceUserIds(
  ctx: MutationCtx,
  audience: Audience,
): Promise<Id<"users">[]> {
  const all = await ctx.db
    .query("users")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  return all.filter((u) => userMatchesAudience(u, audience)).map((u) => u._id);
}

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    pinned: v.optional(v.boolean()),
    audience: audienceValidator,
    category: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    attachments: v.optional(v.array(attachmentValidator)),
    guestVisible: v.optional(v.boolean()),
    /** Future timestamp schedules the announcement instead of publishing now. */
    publishAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const author = await requireManager(ctx);
    assertAttachmentSizeOk(args.attachments ?? []);
    const now = Date.now();
    // Keep the flat storage-id list in sync (used for cleanup on edit/delete).
    const storageIds = args.attachments?.map((a) => a.storageId) ?? args.attachmentStorageIds ?? [];
    const publishedAt = args.publishAt && args.publishAt > now ? args.publishAt : now;
    const category = args.category?.trim() || undefined;
    const id = await ctx.db.insert("announcements", {
      title: args.title,
      body: args.body,
      authorUserId: author._id,
      pinned: args.pinned ?? false,
      audience: args.audience,
      category,
      attachmentStorageIds: storageIds,
      attachments: args.attachments,
      guestVisible: args.guestVisible ?? false,
      publishedAt,
      expiresAt: args.expiresAt,
      createdAt: now,
    });
    await Promise.all(
      storageIds.map((storageId) =>
        ctx.db.insert("attachmentOwners", {
          storageId,
          kind: "announcement",
          announcementId: id,
        }),
      ),
    );

    if (publishedAt > now) {
      // Scheduled: notify the audience when it actually goes live.
      await ctx.scheduler.runAt(publishedAt, internal.announcements.notifyPublished, {
        announcementId: id,
      });
    } else {
      const recipients = (await resolveAudienceUserIds(ctx, args.audience)).filter(
        (uid) => uid !== author._id,
      );
      await notifyUsers(ctx, recipients, {
        type: "announcement",
        title: "New announcement",
        body: args.title,
        link: `/announcements?id=${id}`,
      });
    }

    return { id };
  },
});

/** Fired by the scheduler when a scheduled announcement's publish time lands. */
export const notifyPublished = internalMutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const announcement = await ctx.db.get(announcementId);
    // Deleted, rescheduled further out, or already expired — nothing to send.
    if (!announcement || announcement.publishedAt > Date.now()) return;
    if (announcement.expiresAt && announcement.expiresAt <= Date.now()) return;
    const recipients = (await resolveAudienceUserIds(ctx, announcement.audience)).filter(
      (uid) => uid !== announcement.authorUserId,
    );
    await notifyUsers(ctx, recipients, {
      type: "announcement",
      title: "New announcement",
      body: announcement.title,
      link: `/announcements?id=${announcementId}`,
    });
  },
});

export const update = mutation({
  args: {
    announcementId: v.id("announcements"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    audience: v.optional(audienceValidator),
    category: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    guestVisible: v.optional(v.boolean()),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { announcementId, expiresAt, category, ...patch }) => {
    const user = await requireManager(ctx);
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    if (announcement.authorUserId !== user._id && user.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the author or an admin can edit",
      });
    }
    // Clean up removed attachments, and index newly-added ones so
    // canAccessFile's fast path can find them (existing ones already have a
    // row from create/an earlier update).
    if (patch.attachmentStorageIds) {
      const prev = new Set<string>(announcement.attachmentStorageIds);
      const next = new Set<string>(patch.attachmentStorageIds);
      for (const old of announcement.attachmentStorageIds) {
        if (!next.has(old)) await ctx.storage.delete(old);
      }
      await Promise.all(
        patch.attachmentStorageIds
          .filter((id) => !prev.has(id))
          .map((storageId) =>
            ctx.db.insert("attachmentOwners", {
              storageId,
              kind: "announcement",
              announcementId,
            }),
          ),
      );
    }
    await ctx.db.patch(announcementId, {
      ...patch,
      // null clears the expiry (patching undefined would leave it untouched).
      ...(expiresAt !== undefined ? { expiresAt: expiresAt ?? undefined } : {}),
      // Empty string clears the category the same way null clears the expiry.
      ...(category !== undefined ? { category: category.trim() || undefined } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const user = await requireManager(ctx);
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) return { ok: false };
    if (announcement.authorUserId !== user._id && user.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the author or an admin can delete",
      });
    }
    for (const sid of announcement.attachmentStorageIds) {
      await ctx.storage.delete(sid);
    }
    // Remove read receipts.
    const reads = await ctx.db
      .query("announcementReads")
      .withIndex("by_announcement_user", (q) => q.eq("announcementId", announcementId))
      .collect();
    await Promise.all(reads.map((r) => ctx.db.delete(r._id)));
    // Remove reactions.
    const reactions = await ctx.db
      .query("announcementReactions")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();
    await Promise.all(reactions.map((r) => ctx.db.delete(r._id)));
    await ctx.db.delete(announcementId);
    return { ok: true };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(limit ?? 100);

    // Scheduled (future) and expired announcements stay visible to their
    // author and admins (flagged below) but disappear for everyone else.
    const visible = announcements.filter((a) => {
      const isAuthorOrAdmin = a.authorUserId === user._id || user.role === "admin";
      // The author/an admin must always see it regardless of audience — a
      // manager targeting a "specific people" audience that excludes
      // themselves would otherwise lose the announcement (and the edit/delete
      // controls that only render for authorId === me._id) the moment they
      // create it.
      if (!isAuthorOrAdmin && !userMatchesAudience(user, a.audience)) return false;
      if (a.publishedAt > now && !isAuthorOrAdmin) return false;
      if (a.expiresAt && a.expiresAt <= now && !isAuthorOrAdmin) return false;
      return true;
    });

    // For the author-facing read percentage: active users per audience.
    const activeUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const myReads = await ctx.db
      .query("announcementReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const readSet = new Set(myReads.map((r) => r.announcementId));

    const enriched = await Promise.all(
      visible.map(async (a) => {
        const author = await ctx.db.get(a.authorUserId);
        const authorAvatar = author?.avatarStorageId
          ? await ctx.storage.getUrl(author.avatarStorageId)
          : (author?.avatarUrl ?? null);
        // Prefer stored rich metadata; fall back to resolving the content type
        // from system storage metadata for older rows that only kept ids.
        const attachments =
          a.attachments && a.attachments.length > 0
            ? await Promise.all(
                a.attachments.map(async (att) => ({
                  storageId: att.storageId,
                  kind: att.kind,
                  name: att.name,
                  size: att.size ?? null,
                  contentType: att.contentType ?? null,
                  oneDriveItemId: att.oneDriveItemId ?? null,
                  oneDrivePath: att.oneDrivePath ?? null,
                  url: await ctx.storage.getUrl(att.storageId),
                })),
              )
            : await Promise.all(
                a.attachmentStorageIds.map(async (sid) => {
                  const meta = await ctx.db.system.get(sid);
                  const contentType = meta?.contentType ?? null;
                  return {
                    storageId: sid,
                    kind: contentType?.startsWith("image/")
                      ? ("image" as const)
                      : ("file" as const),
                    name: "Attachment",
                    size: meta?.size ?? null,
                    contentType,
                    oneDriveItemId: null,
                    oneDrivePath: null,
                    url: await ctx.storage.getUrl(sid),
                  };
                }),
              );
        const reactionRows = await ctx.db
          .query("announcementReactions")
          .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
          .collect();
        const reads = await ctx.db
          .query("announcementReads")
          .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
          .collect();
        return {
          _id: a._id,
          title: a.title,
          body: a.body,
          pinned: a.pinned,
          category: a.category ?? null,
          publishedAt: a.publishedAt,
          expiresAt: a.expiresAt ?? null,
          scheduled: a.publishedAt > now,
          expired: !!a.expiresAt && a.expiresAt <= now,
          updatedAt: a.updatedAt ?? null,
          authorName: displayName(author),
          authorAvatar,
          authorId: a.authorUserId,
          audience: a.audience,
          audienceCount: activeUsers.filter((u) => userMatchesAudience(u, a.audience)).length,
          attachments,
          reactions: aggregateReactions(reactionRows, user._id),
          viewCount: reads.length,
          read: readSet.has(a._id),
        };
      }),
    );

    // Pinned first, then newest.
    enriched.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.publishedAt - a.publishedAt;
    });
    return enriched;
  },
});

export const markRead = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("announcementReads")
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", announcementId).eq("userId", user._id),
      )
      .first();
    if (!existing) {
      await ctx.db.insert("announcementReads", {
        announcementId,
        userId: user._id,
        readAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(100);
    const visible = announcements.filter(
      (a) => isVisibleToUser(user, a) && a.publishedAt <= now && (!a.expiresAt || a.expiresAt > now),
    );
    const myReads = await ctx.db
      .query("announcementReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const readSet = new Set(myReads.map((r) => r.announcementId));
    return visible.filter((a) => !readSet.has(a._id)).length;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(200);
    const myReads = await ctx.db
      .query("announcementReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const readSet = new Set(myReads.map((r) => r.announcementId));
    const unread = announcements.filter(
      (a) => isVisibleToUser(user, a) && a.publishedAt <= now && !readSet.has(a._id),
    );
    await Promise.all(
      unread.map((a) =>
        ctx.db.insert("announcementReads", {
          announcementId: a._id,
          userId: user._id,
          readAt: now,
        }),
      ),
    );
    return { marked: unread.length };
  },
});

/** How many active users a draft's audience would reach (create-dialog preview). */
export const audienceSize = query({
  args: { audience: audienceValidator },
  handler: async (ctx, { audience }) => {
    await requireManager(ctx);
    const activeUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return activeUsers.filter((u) => userMatchesAudience(u, audience)).length;
  },
});

export const toggleReaction = mutation({
  args: { announcementId: v.id("announcements"), emoji: v.string() },
  handler: async (ctx, { announcementId, emoji }) => {
    const user = await requireUser(ctx);
    const announcement = await ctx.db.get(announcementId);
    if (!announcement || !isVisibleToUser(user, announcement)) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    // WhatsApp-style: one reaction per user per announcement.
    const existing = await ctx.db
      .query("announcementReactions")
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", announcementId).eq("userId", user._id),
      )
      .first();
    if (existing) {
      if (existing.emoji === emoji) {
        await ctx.db.delete(existing._id);
      } else {
        await ctx.db.patch(existing._id, { emoji, createdAt: Date.now() });
      }
    } else {
      await ctx.db.insert("announcementReactions", {
        announcementId,
        userId: user._id,
        emoji,
        createdAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Users who have viewed (read) an announcement — for the "seen by" popover. */
export const viewers = query({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const user = await requireUser(ctx);
    const announcement = await ctx.db.get(announcementId);
    if (!announcement || !userMatchesAudience(user, announcement.audience)) {
      return [];
    }
    const reads = await ctx.db
      .query("announcementReads")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();
    reads.sort((a, b) => b.readAt - a.readAt);
    return Promise.all(
      reads.map(async (r) => {
        const u = await ctx.db.get(r.userId);
        const avatar = u?.avatarStorageId
          ? await ctx.storage.getUrl(u.avatarStorageId)
          : (u?.avatarUrl ?? null);
        return {
          userId: r.userId,
          name: displayName(u),
          avatar,
          readAt: r.readAt,
        };
      }),
    );
  },
});
