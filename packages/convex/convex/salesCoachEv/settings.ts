import { mutation, query } from "../functions";
import { v } from "convex/values";

import { assertServerKey } from "../lib/auth";

/** Per-user KPI/call-guide text for Sales Coach EV, fed into the AI coaching prompts. */

export const get = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const row = await ctx.db
      .query("salesCoachEvSettings")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    return { kpiText: row?.kpiText ?? "" };
  },
});

export const upsert = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), kpiText: v.string() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const existing = await ctx.db
      .query("salesCoachEvSettings")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { kpiText: args.kpiText, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("salesCoachEvSettings", {
        clerkUserId: args.clerkUserId,
        kpiText: args.kpiText,
        updatedAt: Date.now(),
      });
    }
    return { updated: true };
  },
});
