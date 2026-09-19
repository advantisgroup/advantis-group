import { userQuery, userMutation } from "../functions";
import { v } from "convex/values";
export const upsertMyProgress = userMutation({
  args: {
    checkpointStatuses: v.string(),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
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

export const getMyProgress = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    return ctx.db
      .query("tourProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const getMemberProgress = userQuery({
  role: "manager",
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tourProgress")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const listMemberProgress = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
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
