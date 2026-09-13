import { sandboxedMutation as mutation } from "./lib/sandbox";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit ?? 50);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return recent.filter((n) => !n.readAt).length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== user._id) return { ok: false };
    if (!notification.readAt) {
      await ctx.db.patch(notificationId, { readAt: Date.now() });
    }
    return { ok: true };
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);
    const now = Date.now();
    await Promise.all(
      unread.filter((n) => !n.readAt).map((n) => ctx.db.patch(n._id, { readAt: now })),
    );
    return { ok: true };
  },
});

export const markUnread = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== user._id) return { ok: false };
    if (notification.readAt) {
      await ctx.db.patch(notificationId, { readAt: undefined });
    }
    return { ok: true };
  },
});

export const remove = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== user._id) return { ok: false };
    await ctx.db.delete(notificationId);
    return { ok: true };
  },
});

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const prefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { mutedTypes: prefs?.mutedTypes ?? [], dailyDigest: prefs?.dailyDigest ?? false };
  },
});

export const setPreferences = mutation({
  args: { mutedTypes: v.array(v.string()) },
  handler: async (ctx, { mutedTypes }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { mutedTypes, updatedAt: now });
    } else {
      await ctx.db.insert("notificationPreferences", {
        userId: user._id,
        mutedTypes,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const setDailyDigest = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { dailyDigest: enabled, updatedAt: now });
    } else {
      await ctx.db.insert("notificationPreferences", {
        userId: user._id,
        mutedTypes: [],
        dailyDigest: enabled,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

const DIGEST_ITEMS = 12;

/** Morning email for everyone who opted in: unread notifications since their
 * last digest (at most a day back). Skips people with nothing new. */
export const queueDailyDigests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const subscribers = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_dailyDigest", (q) => q.eq("dailyDigest", true))
      .collect();
    for (const prefs of subscribers) {
      const user = await ctx.db.get(prefs.userId);
      if (!user || user.status !== "active") continue;
      const since = Math.max(prefs.lastDigestAt ?? 0, now - 24 * 60 * 60 * 1000);
      const unread = (
        await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(100)
      ).filter((n) => !n.readAt && n.createdAt > since);
      await ctx.db.patch(prefs._id, { lastDigestAt: now });
      if (unread.length === 0) continue;
      await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
        kind: "digest",
        to: user.email,
        data: {
          count: unread.length,
          items: unread.slice(0, DIGEST_ITEMS).map((n) => ({
            title: n.title,
            body: n.body ?? "",
            link: n.link ?? "/notifications",
          })),
        },
      });
    }
  },
});
