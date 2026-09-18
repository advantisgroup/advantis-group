import { mutation, query } from "./functions";
import { ConvexError, v } from "convex/values";

import { requireManager } from "./lib/auth";

const stepValidator = v.union(
  v.literal("handover"),
  v.literal("tickets"),
  v.literal("guidebooks"),
  v.literal("files"),
  v.literal("devices"),
  v.literal("access"),
);

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireManager(ctx);
    return ctx.db
      .query("offboardingChecklists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const setLastWorkingDay = mutation({
  args: { userId: v.id("users"), lastWorkingDay: v.optional(v.string()) },
  handler: async (ctx, { userId, lastWorkingDay }) => {
    const manager = await requireManager(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError({ code: "not_found", message: "User not found" });
    const existing = await ctx.db
      .query("offboardingChecklists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastWorkingDay: lastWorkingDay || undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("offboardingChecklists", {
        userId,
        lastWorkingDay: lastWorkingDay || undefined,
        completedSteps: [],
        createdByUserId: manager._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const setStep = mutation({
  args: { userId: v.id("users"), step: stepValidator, complete: v.boolean() },
  handler: async (ctx, { userId, step, complete }) => {
    const manager = await requireManager(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError({ code: "not_found", message: "User not found" });
    const existing = await ctx.db
      .query("offboardingChecklists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const current = existing?.completedSteps ?? [];
    const completedSteps = complete
      ? [...new Set([...current, step])]
      : current.filter((item) => item !== step);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { completedSteps, updatedAt: now });
    } else {
      await ctx.db.insert("offboardingChecklists", {
        userId,
        completedSteps,
        createdByUserId: manager._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});
