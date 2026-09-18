import { action, internalMutation, internalQuery, mutation, query } from "../functions";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { requireUser, requireManager, requireAdmin } from "../lib/auth";
import { requireAdminForAction } from "../lib/auth";
import { writeAudit } from "./lib/audit";
import { hashPassword } from "./lib/crypto";
import { appError } from "../lib/errors";
import { type AppConfig, CONFIG_KEYS, readConfig } from "./lib/settings";

const DEBUG_PASSWORD_KEY = "debugToolPasswordHash";

const CONFIG_BOUNDS: Record<keyof AppConfig, { min: number; max: number }> = {
  inactivityThresholdSeconds: { min: 30, max: 7200 },
  offlineThresholdSeconds: { min: 30, max: 3600 },
  retentionDays: { min: 1, max: 3650 },
};

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
 * Crypto to hash; admin-gated via `requireAdminForAction`.
 */
export const setDebugPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const me = await requireAdminForAction(ctx);
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
