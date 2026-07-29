import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/** Slugs the current user has opened at least once. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("guidebookReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows.map((r) => r.slug);
  },
});

/** Idempotent — called once a guidebook page has actually been opened. */
export const markRead = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("guidebookReads")
      .withIndex("by_user_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
      .unique();
    if (existing) return { ok: true };
    await ctx.db.insert("guidebookReads", { userId: user._id, slug, readAt: Date.now() });
    return { ok: true };
  },
});
