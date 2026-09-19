import { internalAction, serverMutation } from "../functions";
import { type Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import { type MutationCtx } from "../_generated/server";
import {
  deleteClerkUser,
  lockClerkUser,
  revokeClerkInvitations,
  revokeClerkSessions,
  unlockClerkUser,
  updateClerkUserAvatar,
  updateClerkUserName,
} from "../lib/clerk";
import { markUserRemoved } from "../lib/users";

/**
 * Both directions of the Clerk ↔ `users` sync.
 *
 * Who owns what: Clerk owns email and the uploaded Clerk avatar; the intranet
 * owns role, status and permissions. Names can change on either side, so the
 * newest change wins (`clerkUpdatedAt`).
 */

// --- Clerk → intranet (apps/api's webhook) -----------------------------------

/** Refreshes a member from a Clerk `user.created`/`user.updated` event. Never
 *  creates members — that's invites and approvals, via lib/auth.ensureUser. */
export const syncFromClerk = serverMutation({
  args: {
    clerkUserId: v.string(),
    updatedAt: v.optional(v.number()),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    banned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!user || user.status === "removed") return { synced: false };
    // Svix can deliver out of order; an older event must not undo a newer one.
    if (args.updatedAt && user.clerkUpdatedAt && args.updatedAt <= user.clerkUpdatedAt) {
      return { synced: false };
    }
    await ctx.db.patch(user._id, {
      ...(args.updatedAt ? { clerkUpdatedAt: args.updatedAt } : {}),
      ...(args.email ? { email: args.email.toLowerCase() } : {}),
      ...(args.firstName !== undefined ? { firstName: args.firstName } : {}),
      ...(args.lastName !== undefined ? { lastName: args.lastName } : {}),
      ...(args.avatarUrl !== undefined ? { avatarUrl: args.avatarUrl } : {}),
      // A ban in the Clerk dashboard suspends here too. Lifting it doesn't
      // reactivate anyone — that stays an intranet admin's call.
      ...(args.banned && user.status === "active" ? { status: "suspended" as const } : {}),
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
    await markUserRemoved(ctx, user);
    return { deactivated: true };
  },
});

// --- Intranet → Clerk ---------------------------------------------------------

const clerkChange = v.union(
  v.object({ kind: v.literal("lock"), clerkUserId: v.string() }),
  v.object({ kind: v.literal("unlock"), clerkUserId: v.string() }),
  v.object({ kind: v.literal("delete"), clerkUserId: v.string() }),
  v.object({
    kind: v.literal("rename"),
    clerkUserId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("avatar"), clerkUserId: v.string(), imageUrl: v.string() }),
  v.object({ kind: v.literal("revokeInvitations"), email: v.string() }),
);

export type ClerkChange = Infer<typeof clerkChange>;

/** Minutes to wait before each retry. The last try is about 14h after the first. */
const RETRY_MINUTES = [1, 5, 30, 120, 720];

/**
 * Tell Clerk about a change the intranet already made. Scheduled from the
 * mutation that made it, so a Clerk outage retries on its own instead of
 * failing the admin's action halfway through.
 */
export function pushToClerk(ctx: MutationCtx, change: ClerkChange) {
  return ctx.scheduler.runAfter(0, internal.people.clerkSync.push, { change, attempt: 0 });
}

export const push = internalAction({
  args: { change: clerkChange, attempt: v.number() },
  handler: async (ctx, { change, attempt }) => {
    try {
      switch (change.kind) {
        case "lock":
          await lockClerkUser(change.clerkUserId);
          return await revokeClerkSessions(change.clerkUserId);
        case "unlock":
          return await unlockClerkUser(change.clerkUserId);
        case "delete":
          return await deleteClerkUser(change.clerkUserId);
        case "rename":
          return await updateClerkUserName(change.clerkUserId, change);
        case "avatar":
          return await updateClerkUserAvatar(change.clerkUserId, change.imageUrl);
        case "revokeInvitations":
          return await revokeClerkInvitations(change.email);
      }
    } catch (error) {
      const wait = RETRY_MINUTES[attempt];
      if (wait === undefined) {
        console.error(`[clerkSync] giving up on ${change.kind} after ${attempt} retries`, error);
        return;
      }
      await ctx.scheduler.runAfter(wait * 60_000, internal.people.clerkSync.push, {
        change,
        attempt: attempt + 1,
      });
    }
  },
});
