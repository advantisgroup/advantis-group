import { mutation, query } from "../functions";
import { v } from "convex/values";

import { requireManager, requireUser } from "../lib/auth";

export const upsertMyProgress = mutation({
  args: {
    checkpointStatuses: v.string(),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("tourProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        checkpointStatuses: args.checkpointStatuses,
        completedAt: args.completedAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("tourProgress", {
        userId: user._id,
        checkpointStatuses: args.checkpointStatuses,
        completedAt: args.completedAt,
        updatedAt: now,
      });
    }
  },
});

export const getMyProgress = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("tourProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const getMemberProgress = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireManager(ctx);
    return ctx.db
      .query("tourProgress")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const listMemberProgress = query({
  args: {},
  handler: async (ctx) => {
    await requireManager(ctx);
    const rows = await ctx.db.query("tourProgress").collect();
    const results = await Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db.get(row.userId);
        return {
          userId: row.userId,
          checkpointStatuses: row.checkpointStatuses,
          completedAt: row.completedAt,
          updatedAt: row.updatedAt,
          name: user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : null,
          email: user?.email ?? null,
        };
      }),
    );
    return results;
  },
});
