import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";
import { type Audience, userMatchesAudience } from "./lib/audience";
import { notifyUsers } from "./lib/notify";
import { audienceValidator } from "./schema";

function authorName(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

async function resolveAudienceUserIds(
  ctx: MutationCtx,
  audience: Audience
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
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    guestVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const author = await requireManager(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("announcements", {
      title: args.title,
      body: args.body,
      authorUserId: author._id,
      pinned: args.pinned ?? false,
      audience: args.audience,
      attachmentStorageIds: args.attachmentStorageIds ?? [],
      guestVisible: args.guestVisible ?? false,
      publishedAt: now,
      createdAt: now,
    });

    const recipients = (await resolveAudienceUserIds(ctx, args.audience)).filter(
      (uid) => uid !== author._id
    );
    await notifyUsers(ctx, recipients, {
      type: "announcement",
      title: "New announcement",
      body: args.title,
      link: "/announcements",
    });

    return { id };
  },
});

export const update = mutation({
  args: {
    announcementId: v.id("announcements"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    audience: v.optional(audienceValidator),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    guestVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, { announcementId, ...patch }) => {
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
    // Clean up removed attachments.
    if (patch.attachmentStorageIds) {
      const next = new Set<string>(patch.attachmentStorageIds);
      for (const old of announcement.attachmentStorageIds) {
        if (!next.has(old)) await ctx.storage.delete(old);
      }
    }
    await ctx.db.patch(announcementId, { ...patch, updatedAt: Date.now() });
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
      .withIndex("by_announcement_user", (q) =>
        q.eq("announcementId", announcementId)
      )
      .collect();
    await Promise.all(reads.map((r) => ctx.db.delete(r._id)));
    await ctx.db.delete(announcementId);
    return { ok: true };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(limit ?? 100);

    const visible = announcements.filter((a) =>
      userMatchesAudience(user, a.audience)
    );

    const myReads = await ctx.db
      .query("announcementReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const readSet = new Set(myReads.map((r) => r.announcementId));

    const enriched = await Promise.all(
      visible.map(async (a) => {
        const author = await ctx.db.get(a.authorUserId);
        const attachments = await Promise.all(
          a.attachmentStorageIds.map(async (sid) => ({
            storageId: sid,
            url: await ctx.storage.getUrl(sid),
          }))
        );
        return {
          _id: a._id,
          title: a.title,
          body: a.body,
          pinned: a.pinned,
          publishedAt: a.publishedAt,
          updatedAt: a.updatedAt ?? null,
          authorName: authorName(author),
          authorId: a.authorUserId,
          attachments,
          read: readSet.has(a._id),
        };
      })
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
        q.eq("announcementId", announcementId).eq("userId", user._id)
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
    const announcements = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(100);
    const visible = announcements.filter((a) =>
      userMatchesAudience(user, a.audience)
    );
    const myReads = await ctx.db
      .query("announcementReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const readSet = new Set(myReads.map((r) => r.announcementId));
    return visible.filter((a) => !readSet.has(a._id)).length;
  },
});
