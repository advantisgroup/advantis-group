import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

/**
 * Server-key gated mutations invoked by the Elysia API's Clerk webhook handler
 * (api.advantisgroup.de). These keep the intranet `users` table in sync with
 * the shared Clerk instance's user lifecycle. They never *create* members —
 * provisioning is gated by invites/approvals via lib/auth.ensureUser — they
 * only refresh profiles and deactivate removed accounts.
 */
function assertServerKey(serverKey: string) {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

export const syncFromClerk = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
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

export const deactivateFromClerk = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!user) return { deactivated: false };
    await ctx.db.delete(user._id);
    return { deactivated: true };
  },
});
