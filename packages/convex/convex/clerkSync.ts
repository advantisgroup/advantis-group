import { serverMutation } from "./functions";
import { v } from "convex/values";

/**
 * Server-key gated mutations invoked by the Elysia API's Clerk webhook handler
 * (api.advantisgroup.de). These keep the intranet `users` table in sync with
 * the shared Clerk instance's user lifecycle. They never *create* members —
 * provisioning is gated by invites/approvals via lib/auth.ensureUser — they
 * only refresh profiles and deactivate removed accounts.
 */
export const syncFromClerk = serverMutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!user) return { synced: false };
    await ctx.db.patch(user._id, {
      ...(args.email ? { email: args.email.toLowerCase() } : {}),
      ...(args.firstName !== undefined ? { firstName: args.firstName } : {}),
      ...(args.lastName !== undefined ? { lastName: args.lastName } : {}),
      ...(args.avatarUrl !== undefined ? { avatarUrl: args.avatarUrl } : {}),
    });
    return { synced: true };
  },
});

export const deactivateFromClerk = serverMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!user) return { deactivated: false };
    await ctx.db.delete(user._id);
    return { deactivated: true };
  },
});
