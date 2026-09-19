import { internalMutation, query, userMutation, userQuery } from "../functions";
import { v } from "convex/values";

import { internal } from "../_generated/api";
export const list = userQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = ctx.caller.user;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take((limit ?? 50) + 20);
    return rows
      .filter((n) => !n.snoozedUntil)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit ?? 50);
  },
});

export const unreadCount = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return recent.filter((n) => !n.readAt).length;
  },
});

export const markRead = userMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = ctx.caller.user;
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== user._id) return { ok: false };
    if (!notification.readAt) {
      await ctx.db.patch(notificationId, { readAt: Date.now() });
    }
    return { ok: true };
  },
});

export const markAllRead = userMutation({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
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

export const markUnread = userMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = ctx.caller.user;
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== user._id) return { ok: false };
    if (notification.readAt) {
      await ctx.db.patch(notificationId, { readAt: undefined });
    }
    return { ok: true };
  },
});

export const snooze = userMutation({
  args: { notificationId: v.id("notifications"), until: v.number() },
  handler: async (ctx, { notificationId, until }) => {
    const user = ctx.caller.user;
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== user._id) return { ok: false };
    const now = Date.now();
    const snoozedUntil = Math.min(Math.max(until, now + 60_000), now + 14 * 24 * 60 * 60 * 1000);
    await ctx.db.patch(notificationId, { snoozedUntil, readAt: notification.readAt ?? now });
    await ctx.scheduler.runAt(snoozedUntil, internal.notifications.notifications.resurface, {
      notificationId,
      snoozedUntil,
    });
    return { ok: true };
  },
});

export const resurface = internalMutation({
  args: { notificationId: v.id("notifications"), snoozedUntil: v.number() },
  handler: async (ctx, { notificationId, snoozedUntil }) => {
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.snoozedUntil !== snoozedUntil) return;
    await ctx.db.patch(notificationId, {
      snoozedUntil: undefined,
      readAt: undefined,
      createdAt: Date.now(),
    });
  },
});

export const remove = userMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = ctx.caller.user;
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== user._id) return { ok: false };
    await ctx.db.delete(notificationId);
    return { ok: true };
  },
});

export const getPreferences = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const prefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return {
      mutedTypes: prefs?.mutedTypes ?? [],
      dailyDigest: prefs?.dailyDigest ?? false,
      weeklyReport: prefs?.weeklyReport ?? false,
    };
  },
});

export const setPreferences = userMutation({
  args: { mutedTypes: v.array(v.string()) },
  handler: async (ctx, { mutedTypes }) => {
    const user = ctx.caller.user;
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

export const setDeliveryOption = userMutation({
  args: {
    option: v.union(v.literal("dailyDigest"), v.literal("weeklyReport")),
    enabled: v.boolean(),
  },
  handler: async (ctx, { option, enabled }) => {
    const user = ctx.caller.user;
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { [option]: enabled, updatedAt: now });
    } else {
      await ctx.db.insert("notificationPreferences", {
        userId: user._id,
        mutedTypes: [],
        [option]: enabled,
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
      await ctx.scheduler.runAfter(0, internal.notifications.email.sendNotificationEmail, {
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

/** Monday email for managers who asked for it: last week against the week
 * before across tickets, error reports and suggestions. */
export const queueWeeklyReports = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const subscribers = (await ctx.db.query("notificationPreferences").collect()).filter(
      (p) => p.weeklyReport,
    );
    if (subscribers.length === 0) return;

    const tickets = await ctx.db
      .query("itTickets")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", now - 2 * week))
      .collect();
    const openTickets = (await ctx.db.query("itTickets").order("desc").take(500)).filter(
      (t) => t.status !== "closed",
    );
    const reports = await ctx.db
      .query("errorReports")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", now - 2 * week))
      .collect();
    const overdueMeasures = (
      await ctx.db
        .query("errorMeasures")
        .withIndex("by_status", (q) => q.eq("status", "offen"))
        .collect()
    ).filter((m) => m.dueAt && m.dueAt < now).length;
    const suggestions = (
      await ctx.db
        .query("suggestions")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", now - week))
        .collect()
    ).length;

    const split = <T extends { createdAt: number }>(rows: T[]) => ({
      thisWeek: rows.filter((r) => r.createdAt >= now - week).length,
      lastWeek: rows.filter((r) => r.createdAt < now - week).length,
    });
    const categoryCounts = new Map<string, number>();
    for (const r of reports.filter((r) => r.createdAt >= now - week)) {
      const name = r.categoryName ?? "—";
      categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
    }
    const data = {
      tickets: split(tickets),
      openTickets: openTickets.length,
      errorReports: split(reports),
      topCategories: [...categoryCounts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
      overdueMeasures,
      suggestions,
    };

    for (const prefs of subscribers) {
      const user = await ctx.db.get(prefs.userId);
      if (!user || user.status !== "active" || user.role === "employee") continue;
      await ctx.scheduler.runAfter(0, internal.notifications.email.sendNotificationEmail, {
        kind: "weekly-report",
        to: user.email,
        data,
      });
    }
  },
});
