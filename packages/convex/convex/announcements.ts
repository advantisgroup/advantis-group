import { internalMutation, userQuery, userMutation } from "./functions";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { assertAttachmentSizeOk } from "./lib/attachments";
import { type Caller } from "./lib/caller";
import { type Audience, userMatchesAudience } from "./lib/audience";
import { notifyUsers } from "./lib/notify";
import { escapeHtml } from "./lib/text";
import { displayName } from "./lib/users";
import { attachmentValidator, audienceValidator, relevantDateValidator } from "./schema";

const INTRANET_BOT_CLERK_USER_ID = "system:intranet-bot";

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

// Capped so the always-visible avatar stacks on the card stay cheap to
// resolve for every announcement in the list — the full lists (for the
// mobile drawer / popover detail views) are fetched separately, lazily, by
// the `reactors`/`viewers`/`nonReaders` queries below.
const REACTION_SAMPLE_SIZE = 4;
const VIEWER_SAMPLE_SIZE = 4;

async function aggregateReactions(
  ctx: QueryCtx,
  rows: { emoji: string; userId: Id<"users">; createdAt: number }[],
  meId: Id<"users">,
): Promise<
  {
    emoji: string;
    count: number;
    mine: boolean;
    sample: { userId: Id<"users">; name: string; avatar: string | null }[];
  }[]
> {
  const byEmoji = new Map<string, { userId: Id<"users">; createdAt: number }[]>();
  for (const r of rows) {
    const entries = byEmoji.get(r.emoji) ?? [];
    entries.push({ userId: r.userId, createdAt: r.createdAt });
    byEmoji.set(r.emoji, entries);
  }
  return Promise.all(
    [...byEmoji.entries()].map(async ([emoji, entries]) => {
      entries.sort((a, b) => b.createdAt - a.createdAt);
      const sample = await Promise.all(
        entries.slice(0, REACTION_SAMPLE_SIZE).map(async ({ userId }) => {
          const u = await ctx.db.get(userId);
          const avatar = u?.avatarStorageId
            ? await ctx.storage.getUrl(u.avatarStorageId)
            : (u?.avatarUrl ?? null);
          return { userId, name: displayName(u), avatar };
        }),
      );
      return {
        emoji,
        count: entries.length,
        mine: entries.some((e) => e.userId === meId),
        sample,
      };
    }),
  );
}

function announcementOwnerUserId(announcement: Doc<"announcements">): Id<"users"> {
  return announcement.ownerUserId ?? announcement.authorUserId;
}

/** The owner and admins can always see an announcement, regardless of audience. */
function isVisibleTo(caller: Caller, a: Doc<"announcements">): boolean {
  return caller.owns(announcementOwnerUserId(a)) || userMatchesAudience(caller.user, a.audience);
}

/** Read-only: works from both query and mutation handlers (MutationCtx is a QueryCtx plus write access). */
async function resolveAudienceUserIds(ctx: QueryCtx, audience: Audience): Promise<Id<"users">[]> {
  const all = await ctx.db
    .query("users")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  return all.filter((u) => userMatchesAudience(u, audience)).map((u) => u._id);
}

export const create = userMutation({
  can: "manage_announcements",
  args: {
    title: v.string(),
    body: v.string(),
    pinned: v.optional(v.boolean()),
    requiresAck: v.optional(v.boolean()),
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
    const author = ctx.caller.user;
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
      requiresAck: args.requiresAck || undefined,
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

export const announceGuidebook = userMutation({
  role: "manager",
  args: {
    guideTitle: v.string(),
    guideDescription: v.optional(v.string()),
    guideSlug: v.string(),
    locale: v.union(v.literal("en"), v.literal("de")),
  },
  handler: async (ctx, args) => {
    const publisher = ctx.caller.user;
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

export const update = userMutation({
  can: "manage_announcements",
  args: {
    announcementId: v.id("announcements"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    requiresAck: v.optional(v.boolean()),
    audience: v.optional(audienceValidator),
    category: v.optional(v.string()),
    relevantDate: v.optional(v.union(relevantDateValidator, v.null())),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { announcementId, expiresAt, category, relevantDate, ...patch }) => {
    const user = ctx.caller.user;
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    if (!ctx.caller.owns(announcementOwnerUserId(announcement))) {
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

export const remove = userMutation({
  can: "manage_announcements",
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) return { ok: false };
    if (!ctx.caller.owns(announcementOwnerUserId(announcement))) {
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
    const acks = await ctx.db
      .query("announcementAcks")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();
    await Promise.all(acks.map((r) => ctx.db.delete(r._id)));
    await ctx.db.delete(announcementId);
    return { ok: true };
  },
});

export const list = userQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = ctx.caller.user;
    const now = Date.now();
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(limit ?? 100);

    // Scheduled (future) and expired announcements stay visible to their
    // owner and admins (flagged below) but disappear for everyone else.
    const visible = announcements.filter((a) => {
      const isOwnerOrAdminUser = ctx.caller.owns(announcementOwnerUserId(a));
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
        const acks = a.requiresAck
          ? await ctx.db
              .query("announcementAcks")
              .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
              .collect()
          : [];
        // Capped avatar sample for the inline "seen by" stack — the full
        // list is fetched lazily by the `viewers`/`nonReaders` queries once
        // the reader actually opens the panel.
        const viewerSample = await Promise.all(
          [...reads]
            .sort((x, y) => y.readAt - x.readAt)
            .slice(0, VIEWER_SAMPLE_SIZE)
            .map(async (r) => {
              const u = await ctx.db.get(r.userId);
              const avatar = u?.avatarStorageId
                ? await ctx.storage.getUrl(u.avatarStorageId)
                : (u?.avatarUrl ?? null);
              return { userId: r.userId, name: displayName(u), avatar };
            }),
        );
        return {
          _id: a._id,
          title: a.title,
          body: a.body,
          pinned: a.pinned,
          requiresAck: a.requiresAck ?? false,
          ackCount: acks.length,
          ackedByMe: acks.some((ack) => ack.userId === user._id),
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
          reactions: await aggregateReactions(ctx, reactionRows, user._id),
          viewCount: reads.length,
          viewerSample,
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

export const markRead = userMutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const user = ctx.caller.user;
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

export const unreadCount = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const now = Date.now();
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(100);
    const visible = announcements.filter(
      (a) =>
        isVisibleTo(ctx.caller, a) && a.publishedAt <= now && (!a.expiresAt || a.expiresAt > now),
    );
    const myReads = await ctx.db
      .query("announcementReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const readSet = new Set(myReads.map((r) => r.announcementId));
    return visible.filter((a) => !readSet.has(a._id)).length;
  },
});

/** Announcements waiting on the caller: ones asking for a read confirmation
 * they haven't given, and pinned ones they haven't opened. */
export const needsAttention = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const now = Date.now();
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(100);
    const pinned = announcements.filter(
      (a) =>
        (a.pinned || a.requiresAck) &&
        isVisibleTo(ctx.caller, a) &&
        a.publishedAt <= now &&
        (!a.expiresAt || a.expiresAt > now),
    );
    const done = await Promise.all(
      pinned.map((a) =>
        ctx.db
          .query(a.requiresAck ? "announcementAcks" : "announcementReads")
          .withIndex("by_announcement_user", (q) =>
            q.eq("announcementId", a._id).eq("userId", user._id),
          )
          .first(),
      ),
    );
    return pinned
      .filter((_, i) => !done[i])
      .map((a) => ({
        _id: a._id,
        title: a.title,
        publishedAt: a.publishedAt,
        requiresAck: a.requiresAck ?? false,
      }));
  },
});

export const acknowledge = userMutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const user = ctx.caller.user;
    const announcement = await ctx.db.get(announcementId);
    if (!announcement || !isVisibleTo(ctx.caller, announcement)) {
      throw new ConvexError({ code: "not_found", message: "Not found" });
    }
    const existing = await ctx.db
      .query("announcementAcks")
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", announcementId).eq("userId", user._id),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("announcementAcks", {
        announcementId,
        userId: user._id,
        ackedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const markAllRead = userMutation({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
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
      (a) => isVisibleTo(ctx.caller, a) && a.publishedAt <= now && !readSet.has(a._id),
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
export const audienceSize = userQuery({
  can: "manage_announcements",
  args: { audience: audienceValidator },
  handler: async (ctx, { audience }) => {
    const activeUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return activeUsers.filter((u) => userMatchesAudience(u, audience)).length;
  },
});

export const toggleReaction = userMutation({
  args: { announcementId: v.id("announcements"), emoji: v.string() },
  handler: async (ctx, { announcementId, emoji }) => {
    const user = ctx.caller.user;
    const announcement = await ctx.db.get(announcementId);
    if (!announcement || !isVisibleTo(ctx.caller, announcement)) {
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

/**
 * Every reactor for an announcement, individually — powers the mobile
 * long-press drawer's per-emoji breakdown. The `list` query only ships a
 * capped avatar sample per emoji for the inline stack, so this is fetched
 * separately, lazily, once the drawer is actually opened.
 */
export const reactors = userQuery({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const announcement = await ctx.db.get(announcementId);
    if (!announcement || !isVisibleTo(ctx.caller, announcement)) {
      return [];
    }
    const rows = await ctx.db
      .query("announcementReactions")
      .withIndex("by_announcement", (q) => q.eq("announcementId", announcementId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(
      rows.map(async (r) => {
        const u = await ctx.db.get(r.userId);
        const avatar = u?.avatarStorageId
          ? await ctx.storage.getUrl(u.avatarStorageId)
          : (u?.avatarUrl ?? null);
        return {
          userId: r.userId,
          name: displayName(u),
          avatar,
          emoji: r.emoji,
        };
      }),
    );
  },
});

/** Users who have viewed (read) an announcement — for the "seen by" popover. */
export const viewers = userQuery({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const announcement = await ctx.db.get(announcementId);
    if (!announcement || !isVisibleTo(ctx.caller, announcement)) {
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
export const nonReaders = userQuery({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const announcement = await ctx.db.get(announcementId);
    if (!announcement) return [];
    if (!ctx.caller.owns(announcementOwnerUserId(announcement))) {
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
