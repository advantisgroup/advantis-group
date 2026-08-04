import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { assertAttachmentSizeOk } from "./lib/attachments";
import { isOwnerOrAdmin, requireCapability, requireManager, requireUser } from "./lib/auth";
import { type Audience, userMatchesAudience } from "./lib/audience";
import { notifyUsers } from "./lib/notify";
import { displayName } from "./lib/users";
import { attachmentValidator, audienceValidator, relevantDateValidator } from "./schema";

const INTRANET_BOT_CLERK_USER_ID = "system:intranet-bot";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

async function getOrCreateIntranetBot(ctx: MutationCtx): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", INTRANET_BOT_CLERK_USER_ID))
    .unique();
  if (existing) return existing._id;

  return await ctx.db.insert("users", {
    clerkUserId: INTRANET_BOT_CLERK_USER_ID,
    email: "intranet-bot@advantisgroup.de",
    firstName: "Intranet",
    lastName: "Bot",
    role: "employee",
    jobTitle: "Automated announcements",
    status: "suspended",
    external: false,
    createdAt: Date.now(),
  });
}

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

function announcementOwnerUserId(announcement: Doc<"announcements">): Id<"users"> {
  return announcement.ownerUserId ?? announcement.authorUserId;
}

/** The owner and admins can always see an announcement, regardless of audience. */
function isVisibleToUser(user: Doc<"users">, a: Doc<"announcements">): boolean {
  return isOwnerOrAdmin(user, announcementOwnerUserId(a)) || userMatchesAudience(user, a.audience);
}

/** Read-only: works from both query and mutation handlers (MutationCtx is a QueryCtx plus write access). */
async function resolveAudienceUserIds(
  ctx: QueryCtx,
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
    relevantDate: v.optional(relevantDateValidator),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    attachments: v.optional(v.array(attachmentValidator)),
    /** Future timestamp schedules the announcement instead of publishing now. */
    publishAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const author = await requireCapability(ctx, "manage_announcements");
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
      ownerUserId: author._id,
      pinned: args.pinned ?? false,
      audience: args.audience,
      category,
      relevantDate: args.relevantDate,
      attachmentStorageIds: storageIds,
      attachments: args.attachments,
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

export const announceGuidebook = mutation({
  args: {
    guideTitle: v.string(),
    guideDescription: v.optional(v.string()),
    guideSlug: v.string(),
    locale: v.union(v.literal("en"), v.literal("de")),
  },
  handler: async (ctx, args) => {
    const publisher = await requireManager(ctx);
    const botUserId = await getOrCreateIntranetBot(ctx);
    const publisherName = displayName(publisher);
    const description = args.guideDescription?.trim();
    const shortDescription =
      description && description.length > 180
        ? `${description.slice(0, 177).trimEnd()}...`
        : description;
    const safePublisherName = escapeHtml(publisherName);
    const safeDescription = shortDescription ? escapeHtml(shortDescription) : undefined;
    const guideHref = `/guidebooks/${encodeURIComponent(args.guideSlug)}`;
    const isGerman = args.locale === "de";
    const title = isGerman
      ? `Neuer Wiki-Eintrag: ${args.guideTitle}`
      : `New guidebook: ${args.guideTitle}`;
    const body = [
      `<p>${safePublisherName} ${
        isGerman ? "hat einen neuen Wiki-Eintrag veröffentlicht." : "has posted a new guidebook."
      }</p>`,
      safeDescription ? `<p>${safeDescription}</p>` : undefined,
      `<p><a href="${guideHref}">${isGerman ? "Wiki-Eintrag öffnen" : "Open guidebook"}</a></p>`,
    ]
      .filter(Boolean)
      .join("");
    const now = Date.now();
    const id = await ctx.db.insert("announcements", {
      title,
      body,
      authorUserId: botUserId,
      ownerUserId: publisher._id,
      pinned: false,
      audience: { kind: "all" },
      category: isGerman ? "Wiki" : "Guidebooks",
      attachmentStorageIds: [],
      publishedAt: now,
      createdAt: now,
    });
    const recipients = (await resolveAudienceUserIds(ctx, { kind: "all" })).filter(
      (userId) => userId !== publisher._id && userId !== botUserId,
    );
    await notifyUsers(ctx, recipients, {
      type: "announcement",
      title: isGerman ? "Neuer Wiki-Eintrag" : "New guidebook",
      body: args.guideTitle,
      link: `/announcements?id=${id}`,
    });

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
      (uid) => uid !== announcementOwnerUserId(announcement),
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
    relevantDate: v.optional(v.union(relevantDateValidator, v.null())),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { announcementId, expiresAt, category, relevantDate, ...patch }) => {
    const user = await requireCapability(ctx, "manage_announcements");
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    if (!isOwnerOrAdmin(user, announcementOwnerUserId(announcement))) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the owner or an admin can edit",
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
      ...(relevantDate !== undefined ? { relevantDate: relevantDate ?? undefined } : {}),
      updatedAt: Date.now(),
      updatedByUserId: user._id,
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const user = await requireCapability(ctx, "manage_announcements");
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) return { ok: false };
    if (!isOwnerOrAdmin(user, announcementOwnerUserId(announcement))) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the owner or an admin can delete",
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
    // owner and admins (flagged below) but disappear for everyone else.
    const visible = announcements.filter((a) => {
      const isOwnerOrAdminUser = isOwnerOrAdmin(user, announcementOwnerUserId(a));
      // The owner/an admin must always see it regardless of audience — a
      // manager targeting a "specific people" audience that excludes
      // themselves would otherwise lose the announcement (and the edit/delete
      // controls that only render for ownerId === me._id) the moment they
      // create it.
      if (!isOwnerOrAdminUser && !userMatchesAudience(user, a.audience)) return false;
      if (a.publishedAt > now && !isOwnerOrAdminUser) return false;
      if (a.expiresAt && a.expiresAt <= now && !isOwnerOrAdminUser) return false;
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
        // Only resolved when it actually differs from the author — an author
        // editing their own announcement doesn't need a name, just the
        // "edited" timestamp already shown.
        const updatedByUser =
          a.updatedByUserId && a.updatedByUserId !== a.authorUserId
            ? await ctx.db.get(a.updatedByUserId)
            : null;
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
          relevantDate: a.relevantDate ?? null,
          publishedAt: a.publishedAt,
          expiresAt: a.expiresAt ?? null,
          scheduled: a.publishedAt > now,
          expired: !!a.expiresAt && a.expiresAt <= now,
          updatedAt: a.updatedAt ?? null,
          updatedByUserId: updatedByUser?._id ?? null,
          updatedByName: updatedByUser ? displayName(updatedByUser) : null,
          authorName: displayName(author),
          authorAvatar,
          authorId: a.authorUserId,
          ownerId: announcementOwnerUserId(a),
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
    const announcement = await ctx.db.get(announcementId);
    // An author/admin can view an announcement outside its own audience (see
    // isVisibleToUser in `list`) — that's a management view, not audience
    // engagement, so it must not count toward read receipts/view stats
    // (which would otherwise let a "2 / 1 read" impossible stat happen).
    if (!announcement || !userMatchesAudience(user, announcement.audience)) {
      return { ok: true };
    }
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
    await requireCapability(ctx, "manage_announcements");
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
    if (!announcement || !isVisibleToUser(user, announcement)) {
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

/**
 * Audience members who haven't read an announcement yet — author/admin only
 * (unlike `viewers`, this is a nudge-to-follow-up tool, not something every
 * reader should see about their colleagues).
 */
export const nonReaders = query({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const user = await requireUser(ctx);
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) return [];
    if (!isOwnerOrAdmin(user, announcementOwnerUserId(announcement))) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the owner or an admin can see who hasn't read this",
      });
    }
    const audienceIds = await resolveAudienceUserIds(ctx, announcement.audience);
    const reads = await ctx.db
      .query("announcementReads")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();
    const readSet = new Set(reads.map((r) => r.userId));
    const nonReaderIds = audienceIds.filter(
      (id) => id !== announcementOwnerUserId(announcement) && !readSet.has(id),
    );
    const users = await Promise.all(nonReaderIds.map((id) => ctx.db.get(id)));
    return Promise.all(
      users
        .filter((u): u is Doc<"users"> => u !== null)
        .map(async (u) => {
          const avatar = u.avatarStorageId
            ? await ctx.storage.getUrl(u.avatarStorageId)
            : (u.avatarUrl ?? null);
          return { userId: u._id, name: displayName(u), avatar };
        }),
    );
  },
});
