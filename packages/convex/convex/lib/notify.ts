import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";

export interface NotifyArgs {
  userId: Id<"users">;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Internal helper to drop an in-app notification. Reused by absence decisions,
 * new announcements, chat invitations, etc. Email side of notifications is
 * handled separately by the Elysia API.
 */
export async function createNotification(
  ctx: MutationCtx,
  args: NotifyArgs,
): Promise<Id<"notifications"> | null> {
  // Respect the recipient's notification preferences — skip muted types.
  const prefs = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .unique();
  if (prefs?.mutedTypes.includes(args.type)) return null;

  return ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    createdAt: Date.now(),
  });
}

/** Notify many users at once. */
export async function notifyUsers(
  ctx: MutationCtx,
  userIds: Id<"users">[],
  args: Omit<NotifyArgs, "userId">,
): Promise<void> {
  await Promise.all(userIds.map((userId) => createNotification(ctx, { ...args, userId })));
}
