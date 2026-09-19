import { query, userQuery, userMutation } from "../functions";
import { v } from "convex/values";

import { effectiveRole, MANAGER_ROLES } from "../lib/auth";

export const getMine = userQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = ctx.caller.user;
    const row = await ctx.db
      .query("guidebookFeedback")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
      .unique();
    return row ? { helpful: row.helpful } : null;
  },
});

export const set = userMutation({
  args: { slug: v.string(), helpful: v.boolean() },
  handler: async (ctx, { slug, helpful }) => {
    const user = ctx.caller.user;
    const existing = await ctx.db
      .query("guidebookFeedback")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { helpful, updatedAt: now });
    } else {
      await ctx.db.insert("guidebookFeedback", {
        userId: user._id,
        slug,
        helpful,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

/** Helpful/total counts per guidebook, for managers reviewing content. */
export const stats = userQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = ctx.caller.user;
    if (!MANAGER_ROLES.includes(effectiveRole(user))) return null;
    const rows = await ctx.db
      .query("guidebookFeedback")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    return {
      helpful: rows.filter((r) => r.helpful).length,
      total: rows.length,
    };
  },
});
