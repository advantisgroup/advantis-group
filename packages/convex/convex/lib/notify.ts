import { internal } from "../_generated/api";
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

  const id = await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    createdAt: Date.now(),
  });
  // Push to the person's browsers too, for when no intranet tab is open. Only
  // scheduled when they have a subscribed browser at all.
  const subscribed = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .first();
  if (subscribed) {
    await ctx.scheduler.runAfter(0, internal.notifications.push.send, { notificationId: id });
  }
  return id;
}

/** Notify many users at once. */
export async function notifyUsers(
  ctx: MutationCtx,
  userIds: Id<"users">[],
  args: Omit<NotifyArgs, "userId">,
): Promise<void> {
  await Promise.all(userIds.map((userId) => createNotification(ctx, { ...args, userId })));
}

/** Something broke that nobody would otherwise notice — tell every active admin. */
export async function alertAdmins(
  ctx: MutationCtx,
  args: { title: string; body?: string; link?: string },
): Promise<void> {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  await notifyUsers(
    ctx,
    admins.filter((u) => u.status === "active").map((u) => u._id),
    { type: "system_alert", link: "/admin", ...args },
  );
}
