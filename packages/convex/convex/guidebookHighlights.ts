import { mutation, query } from "./functions";
import { v } from "convex/values";

import { requireCapability, requireUser } from "./lib/auth";

/** Currently highlighted guidebook slugs, most recently featured first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("guidebookHighlights").order("desc").collect();
    return rows.map((r) => r.slug);
  },
});

/** Requires the manage_guidebooks capability — toggles a guidebook's highlighted state. */
export const toggle = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const existing = await ctx.db
      .query("guidebookHighlights")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { highlighted: false };
    }
    await ctx.db.insert("guidebookHighlights", {
      slug,
      highlightedByUserId: user._id,
      highlightedAt: Date.now(),
    });
    return { highlighted: true };
  },
});
