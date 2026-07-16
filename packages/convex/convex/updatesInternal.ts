import { v } from "convex/values";

import { internalQuery } from "./_generated/server";

/**
 * internalQuery helpers for updatesEmail.ts — actions can't touch ctx.db
 * directly, so the bulk-send action reads through these.
 */

export const getForEmail = internalQuery({
  args: { updateId: v.id("updates") },
  handler: async (ctx, { updateId }) => {
    const update = await ctx.db.get(updateId);
    if (!update) return null;
    return {
      type: update.type,
      title: update.title,
      summary: update.summary,
      audience: update.audience,
      authorUserId: update.authorUserId,
    };
  },
});

export const listActiveUsers = internalQuery({
  args: {},
  handler: async ctx => {
    return ctx.db
      .query("users")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();
  },
});
