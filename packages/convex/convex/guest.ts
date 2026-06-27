import { v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc } from "./_generated/dataModel";
import { type QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

const DEFAULT_HOURS = 48;

function newToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

async function resolveActiveToken(
  ctx: QueryCtx,
  token: string
): Promise<Doc<"tempLogins"> | null> {
  if (!token) return null;
  const login = await ctx.db
    .query("tempLogins")
    .withIndex("by_token", q => q.eq("token", token))
    .first();
  if (!login) return null;
  if (login.status !== "active") return null;
  if (login.expiresAt < Date.now()) return null;
  return login;
}

// --- Guest-facing (token-gated, no Clerk) -----------------------------------

export const validateToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const login = await resolveActiveToken(ctx, token);
    if (!login) return { valid: false as const };
    return {
      valid: true as const,
      label: login.label,
      expiresAt: login.expiresAt,
    };
  },
});

/** Curated tour content for a valid guest token. Only guest-visible items. */
export const getTourContent = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const login = await resolveActiveToken(ctx, token);
    if (!login) return null;

    const announcementDocs = await ctx.db
      .query("announcements")
      .withIndex("by_publishedAt")
      .order("desc")
      .take(200);
    const announcements = announcementDocs
      .filter(a => a.guestVisible === true)
      .slice(0, 50)
      .map(a => ({
        _id: a._id,
        title: a.title,
        body: a.body,
        publishedAt: a.publishedAt,
      }));

    const now = Date.now();
    const eventDocs = await ctx.db
      .query("events")
      .withIndex("by_start", q => q.gte("start", now - 7 * 86400000))
      .take(200);
    const events = eventDocs
      .filter(e => e.guestVisible === true)
      .slice(0, 50)
      .map(e => ({
        _id: e._id,
        title: e.title,
        description: e.description ?? null,
        location: e.location ?? null,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
      }));

    return {
      label: login.label,
      expiresAt: login.expiresAt,
      announcements,
      events,
    };
  },
});

export const touch = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const login = await resolveActiveToken(ctx, token);
    if (login) await ctx.db.patch(login._id, { lastUsedAt: Date.now() });
    return { ok: true };
  },
});

// --- Admin management --------------------------------------------------------

export const createTempLogin = mutation({
  args: {
    label: v.string(),
    email: v.optional(v.string()),
    hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const token = newToken();
    const hours = args.hours && args.hours > 0 ? args.hours : DEFAULT_HOURS;
    const id = await ctx.db.insert("tempLogins", {
      label: args.label.trim() || "Guest",
      email: args.email?.trim().toLowerCase(),
      token,
      createdByUserId: admin._id,
      expiresAt: Date.now() + hours * 60 * 60 * 1000,
      status: "active",
      createdAt: Date.now(),
    });

    if (args.email) {
      await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
        kind: "guest-invite",
        to: args.email,
        data: { label: args.label, token, hours },
      });
    }
    return { id, token };
  },
});

export const listTempLogins = query({
  args: {},
  handler: async ctx => {
    await requireAdmin(ctx);
    const logins = await ctx.db.query("tempLogins").order("desc").take(100);
    const now = Date.now();
    return logins.map(l => ({
      _id: l._id,
      label: l.label,
      email: l.email ?? null,
      token: l.token,
      expiresAt: l.expiresAt,
      status: l.expiresAt < now && l.status === "active" ? "expired" : l.status,
      lastUsedAt: l.lastUsedAt ?? null,
      createdAt: l.createdAt,
    }));
  },
});

export const revokeTempLogin = mutation({
  args: { id: v.id("tempLogins") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, { status: "revoked" });
    return { ok: true };
  },
});
