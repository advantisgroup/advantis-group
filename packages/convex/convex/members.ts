import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { createClerkInvitation, deleteClerkUser } from "./lib/clerk";

/**
 * Admin-side member lifecycle actions that reach Clerk's Backend API. Kept
 * separate from the plain `users` mutations because, like invites, they run as
 * actions so the Clerk call is awaited and failures surface to the admin.
 */

/**
 * Auth + locally revoke access, returning what the action needs to delete the
 * Clerk account. We suspend (rather than hard-delete the row) so historical
 * references — announcement authors, invite inviters, presence — stay intact;
 * deleting the Clerk user is what actually removes their ability to sign in.
 */
export const prepareRemove = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id) {
      throw new ConvexError({
        code: "bad_request",
        message: "You cannot remove yourself",
      });
    }
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await ctx.db.delete(userId);
    return { clerkUserId: target.clerkUserId };
  },
});

/** Remove a member: revoke intranet access and delete their Clerk account. */
export const remove = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ ok: true }> => {
    const rec = await ctx.runMutation(internal.members.prepareRemove, {
      userId,
    });
    if (rec.clerkUserId) {
      await deleteClerkUser(rec.clerkUserId);
    }
    return { ok: true };
  },
});

/** Auth + fetch the address/role needed to re-send a member's invitation. */
export const inviteInfo = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    return {
      email: target.email,
      role: target.role,
      invitedByName:
        [admin.firstName, admin.lastName].filter(Boolean).join(" ") ||
        admin.email,
    };
  },
});

/**
 * Re-send a member their Clerk invitation / sign-up link. Useful to re-onboard
 * a member who hasn't finished setup. (Clerk's Backend API has no "email a
 * password reset" endpoint, so re-inviting is the supported recovery path.)
 */
export const reinvite = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ ok: true }> => {
    const rec = await ctx.runMutation(internal.members.inviteInfo, { userId });
    await createClerkInvitation({
      email: rec.email,
      role: rec.role,
      invitedByName: rec.invitedByName,
    });
    return { ok: true };
  },
});
