import { internalQuery, userAction, userMutation } from "../functions";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { createClerkInvitation } from "../lib/clerk";
import { displayName, markUserRemoved } from "../lib/users";
import { pushToClerk } from "./clerkSync";

/**
 * Revoke a member's intranet access and delete their Clerk account. The row
 * is marked removed rather than deleted so historical references —
 * announcement authors, invite inviters, audit rows — stay intact; deleting
 * the Clerk user is what actually removes their ability to sign in.
 */
export const remove = userMutation({
  role: "admin",
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    if (userId === ctx.caller.id) {
      throw new ConvexError({ code: "bad_request", message: "You cannot remove yourself" });
    }
    const target = await ctx.db.get(userId);
    if (!target || target.status === "removed") {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    if (target.role === "admin") {
      throw new ConvexError({
        code: "bad_request",
        message: "Admins cannot be removed — change their role first",
      });
    }
    await markUserRemoved(ctx, target, ctx.caller.id);
    if (target.clerkUserId) {
      await pushToClerk(ctx, { kind: "delete", clerkUserId: target.clerkUserId });
    }
    return { ok: true };
  },
});

export const inviteTarget = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const target = await ctx.db.get(userId);
    if (!target || target.status === "removed") {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    return { email: target.email, role: target.role };
  },
});

/**
 * Re-send a member their Clerk invitation / sign-up link. Useful to re-onboard
 * a member who hasn't finished setup. (Clerk's Backend API has no "email a
 * password reset" endpoint, so re-inviting is the supported recovery path.)
 * An action so a Clerk rejection reaches the admin straight away.
 */
export const reinvite = userAction({
  role: "admin",
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ ok: true }> => {
    const target = await ctx.runQuery(internal.people.members.inviteTarget, { userId });
    await createClerkInvitation({ ...target, invitedByName: displayName(ctx.caller.user) });
    return { ok: true };
  },
});
