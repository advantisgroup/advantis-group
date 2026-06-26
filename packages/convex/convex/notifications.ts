import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
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
      unread
        .filter((n) => !n.readAt)
        .map((n) => ctx.db.patch(n._id, { readAt: now }))
    );
    return { ok: true };
  },
});
