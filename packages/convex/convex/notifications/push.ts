import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery, userMutation } from "../functions";
import { internalApiFetch } from "../lib/internalApi";

/** Registers this browser for push. An endpoint belongs to one browser, so
 *  signing in as someone else on it moves the endpoint to them. */
export const subscribe = userMutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.endpoint.startsWith("https://")) return { ok: false as const };
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    const row = { ...args, userId: ctx.caller.user._id, createdAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("pushSubscriptions", row);
    return { ok: true as const };
  },
});

export const unsubscribe = userMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (existing && existing.userId === ctx.caller.user._id) await ctx.db.delete(existing._id);
  },
});

interface PushTarget {
  notification: { title: string; body: string | null; link: string | null; id: string };
  subscriptions: { endpoint: string; p256dh: string; auth: string }[];
}

/** What to push for a notification, and where — nothing if the person turned
 *  browser notifications off or has no subscribed browser. */
export const target = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }): Promise<PushTarget | null> => {
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.readAt) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", notification.userId))
      .unique();
    if (!prefs?.browserPushEnabled) return null;
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", notification.userId))
      .collect();
    if (subscriptions.length === 0) return null;
    return {
      notification: {
        id: notification._id,
        title: notification.title,
        body: notification.body ?? null,
        link: notification.link ?? null,
      },
      subscriptions: subscriptions.map(({ endpoint, p256dh, auth }) => ({
        endpoint,
        p256dh,
        auth,
      })),
    };
  },
});

export const removeEndpoints = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, { endpoints }) => {
    for (const endpoint of endpoints) {
      const row = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
  },
});

/** Hands one notification to the API, which owns the VAPID keys and does
 *  the Web Push encryption. Browsers the push service says are gone get
 *  forgotten. A no-op when the API isn't configured. */
export const send = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }): Promise<{ sent: number }> => {
    const push: PushTarget | null = await ctx.runQuery(internal.notifications.push.target, {
      notificationId,
    });
    if (!push) return { sent: 0 };
    const res = await internalApiFetch("/internal/push/send", push);
    if (!res?.ok) {
      if (res) console.error(`[push] send failed: ${res.status} ${await res.text()}`);
      return { sent: 0 };
    }
    const { sent, gone } = (await res.json()) as { sent: number; gone: string[] };
    if (gone.length > 0) {
      await ctx.runMutation(internal.notifications.push.removeEndpoints, { endpoints: gone });
    }
    return { sent };
  },
});
