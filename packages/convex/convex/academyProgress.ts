import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";

export const getMine = query({
  args: { academyId: v.string() },
  handler: async (ctx, { academyId }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query("academyProgress")
      .withIndex("by_user_academy", q =>
        q.eq("userId", user._id).eq("academyId", academyId)
      )
      .unique();
    return row ? { data: row.data, updatedAt: row.updatedAt } : null;
  },
});

export const saveMine = mutation({
  args: { academyId: v.string(), data: v.string() },
  handler: async (ctx, { academyId, data }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("academyProgress")
      .withIndex("by_user_academy", q =>
        q.eq("userId", user._id).eq("academyId", academyId)
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt: now });
    } else {
      await ctx.db.insert("academyProgress", {
        userId: user._id,
        academyId,
        data,
        updatedAt: now,
      });
    }
  },
});

/** Trainer dashboard: every participant's progress for an academy. */
export const listAll = query({
  args: { academyId: v.string() },
  handler: async (ctx, { academyId }) => {
    await requireManager(ctx);
    const rows = await ctx.db
      .query("academyProgress")
      .withIndex("by_academy", q => q.eq("academyId", academyId))
      .collect();
    return Promise.all(
      rows.map(async row => {
        const user = await ctx.db.get(row.userId);
        return {
          userId: row.userId,
          data: row.data,
          updatedAt: row.updatedAt,
          name: user
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
              user.email
            : null,
          email: user?.email ?? null,
        };
      })
    );
  },
});
