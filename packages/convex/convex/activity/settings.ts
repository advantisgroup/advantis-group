import { sandboxedMutation as mutation, sandboxedAction as action } from "../lib/sandbox";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { query, internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser, requireManager, requireAdmin } from "../lib/auth";
import { requireAdminAction } from "../integrations/lib/auth";
import { writeAudit } from "./audit";
import { hashPassword } from "./lib/crypto";
import { appError } from "./lib/errors";

const DEBUG_PASSWORD_KEY = "debugToolPasswordHash";

/**
 * Operational configuration, persisted as individual `activitySettings` rows.
 * `readConfig` merges stored overrides onto the defaults so every consumer
 * reads one coherent shape.
 */
const CONFIG_KEYS = {
  inactivityThresholdSeconds: "config.inactivityThresholdSeconds",
  offlineThresholdSeconds: "config.offlineThresholdSeconds",
  retentionDays: "config.retentionDays",
} as const;

export interface AppConfig {
  inactivityThresholdSeconds: number;
  offlineThresholdSeconds: number;
  retentionDays: number;
}

export const CONFIG_DEFAULTS: AppConfig = {
  inactivityThresholdSeconds: 300,
  // Must stay above the desktop agent's keepalive interval (180s, see
  // tracker.rs in ActivityTrack) with margin, or "online" flickers offline
  // between keepalives. Kept equal to MAX_ATTRIBUTION_MS in ingest.ts.
  offlineThresholdSeconds: 360,
  retentionDays: 90,
};

const CONFIG_BOUNDS: Record<keyof AppConfig, { min: number; max: number }> = {
  inactivityThresholdSeconds: { min: 30, max: 7200 },
  offlineThresholdSeconds: { min: 30, max: 3600 },
  retentionDays: { min: 1, max: 3650 },
};

/** Read the merged operational config (defaults + any stored overrides). */
export async function readConfig(ctx: QueryCtx | MutationCtx): Promise<AppConfig> {
  const out: AppConfig = { ...CONFIG_DEFAULTS };
  for (const [field, key] of Object.entries(CONFIG_KEYS) as [keyof AppConfig, string][]) {
    const row = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) {
      const n = Number(row.value);
      if (Number.isFinite(n)) out[field] = n;
    }
  }
  return out;
}

/** Reactive read of the operational config for the Settings form. */
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await readConfig(ctx);
  },
});

/** Update one or more operational config values. Manager+, range-validated. */
export const setConfig = mutation({
  args: {
    inactivityThresholdSeconds: v.optional(v.number()),
    offlineThresholdSeconds: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireManager(ctx);
    const now = Date.now();
    for (const field of Object.keys(CONFIG_KEYS) as (keyof AppConfig)[]) {
      const value = args[field];
      if (value === undefined) continue;
      const { min, max } = CONFIG_BOUNDS[field];
      if (!Number.isFinite(value) || value < min || value > max) {
        throw appError("validation.out_of_range", `${field} must be between ${min} and ${max}`);
      }
      const key = CONFIG_KEYS[field];
      const existing = await ctx.db
        .query("activitySettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          value: String(value),
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("activitySettings", {
          key,
          value: String(value),
          updatedAt: now,
        });
      }
    }
    await writeAudit(ctx, me._id, "settings.config", "operational config");
  },
});

/** Read a setting row (internal — used by the verify HTTP endpoint). */
export const getByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  },
});

/** Whether the tray-app debug password has been configured. Admin. */
export const debugPasswordIsSet = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", DEBUG_PASSWORD_KEY))
      .unique();
    return !!row;
  },
});

/** Internal: persist a hashed setting + audit. Called from the action below. */
export const store = internalMutation({
  args: {
    actorUserId: v.id("users"),
    key: v.string(),
    value: v.string(),
    auditLabel: v.string(),
  },
  handler: async (ctx, { actorUserId, key, value, auditLabel }) => {
    const existing = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("activitySettings", {
        key,
        value,
        updatedAt: Date.now(),
      });
    }
    await writeAudit(ctx, actorUserId, "settings.update", auditLabel);
  },
});

/**
 * Set the tray-app debug login password. Runs as an action so it can use Web
 * Crypto to hash; admin-gated via `requireAdminAction`.
 */
export const setDebugPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const me = await requireAdminAction(ctx);
    if (password.length < 6) {
      throw appError("validation.password_short", "Password must be at least 6 characters");
    }
    const hash = await hashPassword(password);
    await ctx.runMutation(internal.activity.settings.store, {
      actorUserId: me._id,
      key: DEBUG_PASSWORD_KEY,
      value: hash,
      auditLabel: "debug tool password",
    });
  },
});

export const DEBUG_PASSWORD_SETTING_KEY = DEBUG_PASSWORD_KEY;
