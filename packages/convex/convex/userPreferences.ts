import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const preferenceFields = {
  hiddenDashboardCards: v.optional(v.array(v.string())),
  defaultCalendarView: v.optional(
    v.union(v.literal("month"), v.literal("week"), v.literal("list"))
  ),
  startPage: v.optional(v.string()),
  weekStartsOn: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
  favoriteFolders: v.optional(v.array(v.string())),
  favoriteGuidebooks: v.optional(v.array(v.string())),
  lastGuidebookSlug: v.optional(v.string()),
  dismissedWhatsNew: v.optional(v.string()),
  browserPushEnabled: v.optional(v.boolean()),
};

export const getMine = query({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .unique();
    return prefs ?? null;
  },
});

export const setMine = mutation({
  args: preferenceFields,
  handler: async (ctx, patch) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        ...patch,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});
