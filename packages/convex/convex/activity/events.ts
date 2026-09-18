import { internalMutation, mutation, query } from "../functions";
import { v } from "convex/values";

import type { MutationCtx } from "../_generated/server";
import { requireUser, requireAdmin } from "../lib/auth";
import { writeAudit } from "./audit";
import { appError } from "../lib/errors";
import { safeEqual } from "./lib/crypto";
import { displayName } from "./lib/users";

/**
 * Central operational event log. Every surface reports here (backend, tracker,
 * dashboard). IT sees the technical `message`/`context`; everyone else sees a
 * plain-language line derived from `code`. Deduplicated onto a single OPEN row
 * per (code, deviceId) so a recurring failure can't flood the table.
 */

export type Severity = "info" | "warning" | "error" | "critical";
export type Source = "backend" | "tracker" | "dashboard";

const severityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("error"),
  v.literal("critical"),
);
const sourceValidator = v.union(v.literal("backend"), v.literal("tracker"), v.literal("dashboard"));

interface LogArgs {
  severity: Severity;
  code: string;
  source: Source;
  message: string;
  deviceId?: string;
  hostname?: string;
  context?: string;
}

/** Shared writer usable from any mutation context. */
export async function logEvent(ctx: MutationCtx, args: LogArgs): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("activitySystemEvents")
    .withIndex("by_open", (q) =>
      q.eq("resolvedAt", undefined).eq("code", args.code).eq("deviceId", args.deviceId),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      lastAt: now,
      message: args.message,
      severity: args.severity,
      ...(args.hostname !== undefined ? { hostname: args.hostname } : {}),
      ...(args.context !== undefined ? { context: args.context } : {}),
    });
    return;
  }

  await ctx.db.insert("activitySystemEvents", {
    severity: args.severity,
    code: args.code,
    source: args.source,
    message: args.message,
    deviceId: args.deviceId,
    hostname: args.hostname,
    context: args.context,
    count: 1,
    firstAt: now,
    lastAt: now,
  });
}

/** Internal entry point for HTTP actions / the Elysia layer. */
export const record = internalMutation({
  args: {
    severity: severityValidator,
    code: v.string(),
    source: sourceValidator,
    message: v.string(),
    deviceId: v.optional(v.string()),
    hostname: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logEvent(ctx, args);
  },
});

const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

/** Plain-language health summary for the whole team. Any signed-in user. */
export const health = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const now = Date.now();

    const activeDevices = await ctx.db
      .query("devices")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const offlineDevices = await Promise.all(
      activeDevices
        .filter((d) => now - d.lastSeen > OFFLINE_THRESHOLD_MS)
        .map(async (d) => {
          const person = d.personId ? await ctx.db.get(d.personId) : null;
          return {
            deviceId: d.deviceId,
            hostname: d.hostname,
            personName: person?.name ?? null,
            lastSeen: d.lastSeen,
            offlineForMs: now - d.lastSeen,
          };
        }),
    );
    offlineDevices.sort((a, b) => b.offlineForMs - a.offlineForMs);

    const openEvents = await ctx.db
      .query("activitySystemEvents")
      .withIndex("by_resolvedAt", (q) => q.eq("resolvedAt", undefined))
      .order("desc")
      .take(200);

    const recentIssues = openEvents.slice(0, 50).map((e) => ({
      id: e._id,
      severity: e.severity,
      code: e.code,
      source: e.source,
      deviceId: e.deviceId ?? null,
      hostname: e.hostname ?? null,
      count: e.count,
      lastAt: e.lastAt,
    }));

    const worstSeverity: Severity | null = openEvents.reduce<Severity | null>((worst, e) => {
      const rank: Record<Severity, number> = {
        info: 0,
        warning: 1,
        error: 2,
        critical: 3,
      };
      if (!worst || rank[e.severity] > rank[worst]) return e.severity;
      return worst;
    }, null);

    return {
      generatedAt: now,
      offlineDevices,
      openEventCount: openEvents.length,
      worstSeverity,
      recentIssues,
    };
  },
});

/** Full technical event log with the raw message/context. Admin. */
export const listEvents = query({
  args: {
    onlyOpen: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { onlyOpen, limit }) => {
    await requireAdmin(ctx);
    const take = Math.min(limit ?? 200, 1000);

    let rows;
    if (onlyOpen) {
      rows = await ctx.db
        .query("activitySystemEvents")
        .withIndex("by_resolvedAt", (q) => q.eq("resolvedAt", undefined))
        .order("desc")
        .take(take);
    } else {
      rows = await ctx.db
        .query("activitySystemEvents")
        .withIndex("by_lastAt")
        .order("desc")
        .take(take);
    }

    return Promise.all(
      rows.map(async (r) => {
        const resolver = r.resolvedBy ? await ctx.db.get(r.resolvedBy) : null;
        return {
          ...r,
          resolvedByName: resolver ? displayName(resolver) : null,
        };
      }),
    );
  },
});

/** Mark an event resolved (acknowledged/fixed). Admin. */
export const resolveEvent = mutation({
  args: { eventId: v.id("activitySystemEvents") },
  handler: async (ctx, { eventId }) => {
    const actor = await requireAdmin(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw appError("notFound.event", "Event not found");
    await ctx.db.patch(eventId, {
      resolvedAt: Date.now(),
      resolvedBy: actor._id,
    });
    await writeAudit(ctx, actor._id, "event.resolve", event.code);
  },
});

/** Report a client-side dashboard crash (from the ErrorBoundary). */
export const logFromDashboard = mutation({
  args: { message: v.string(), context: v.optional(v.string()) },
  handler: async (ctx, { message, context }) => {
    await requireUser(ctx);
    await logEvent(ctx, {
      severity: "error",
      code: "dashboard.crash",
      source: "dashboard",
      message: message.slice(0, 2000),
      context: context?.slice(0, 2000),
    });
  },
});

/** Server-to-server event logging from the Elysia API layer. */
export const logFromServer = mutation({
  args: {
    secret: v.string(),
    severity: severityValidator,
    code: v.string(),
    message: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, { secret, severity, code, message, context }) => {
    const expected = process.env.ACTIVITYTRACK_SIGNAL_SECRET;
    if (!expected || !safeEqual(secret, expected)) {
      throw appError("auth.forbidden", "Invalid signal secret");
    }
    await logEvent(ctx, {
      severity,
      code,
      source: "backend",
      message: message.slice(0, 2000),
      context: context?.slice(0, 2000),
    });
  },
});

/** Retention: drop resolved events older than 90 days in bounded batches. */
export const purgeOldEvents = internalMutation({
  args: { retentionDays: v.optional(v.number()) },
  handler: async (ctx, { retentionDays }) => {
    const days = retentionDays ?? 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("activitySystemEvents")
      .withIndex("by_resolvedAt", (q) => q.gt("resolvedAt", 0))
      .take(4000);
    let deleted = 0;
    for (const row of stale) {
      if (row.lastAt < cutoff) {
        await ctx.db.delete(row._id);
        deleted++;
        if (deleted >= 2000) break;
      }
    }
    return { deleted };
  },
});
