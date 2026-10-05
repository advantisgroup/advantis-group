import { userMutation } from "../functions";
import { v } from "convex/values";
import { toClockodoIdString } from "../lib/clockodoId";
import { appError } from "../lib/errors";
import { writeIntegrationsAudit } from "./lib/audit";

/** Single write path for linking an intranet employee to a Clockodo user id. */
export const linkClockodoUser = userMutation({
  can: "manage_clockodo_team",
  args: {
    userId: v.id("users"),
    clockodoUserId: v.number(),
  },
  handler: async (ctx, { userId, clockodoUserId }) => {
    const actor = ctx.caller.user;
    const user = await ctx.db.get(userId);
    if (!user) throw appError("not_found", "User not found");

    const clockodoUserIdStr = toClockodoIdString(clockodoUserId);
    await ctx.db.patch(userId, { clockodoUserId: clockodoUserIdStr });

    await writeIntegrationsAudit(ctx, actor._id, "clockodo", "clockodo.link", user.email);
  },
});

export const unlinkClockodoUser = userMutation({
  can: "manage_clockodo_team",
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const actor = ctx.caller.user;
    const user = await ctx.db.get(userId);
    if (!user) throw appError("not_found", "User not found");

    await ctx.db.patch(userId, { clockodoUserId: undefined });

    // A leftover ActivityTrack `people` row still carrying the id would be
    // picked up again by `migrateLegacyClockodoLink` on the next /clockodo
    // visit, silently undoing this unlink.
    const person = await ctx.db
      .query("people")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (person) {
      await ctx.db.patch(person._id, { clockodoUserId: undefined });
    }

    await writeIntegrationsAudit(ctx, actor._id, "clockodo", "clockodo.unlink", user.email);
  },
});

/**
 * One-time move of a Clockodo link that only lives on the person's old
 * ActivityTrack `people` row (the table is kept until its data is deleted)
 * onto `users.clockodoUserId`, the only place absences read it from.
 */
export const migrateLegacyClockodoLink = userMutation({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    if (user.clockodoUserId != null) {
      return { status: "already_linked" as const };
    }

    const person = await ctx.db
      .query("people")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    const clockodoUserId = person?.clockodoUserId?.trim();
    if (!clockodoUserId) {
      return { status: "not_found" as const };
    }

    await ctx.db.patch(user._id, { clockodoUserId });
    await writeIntegrationsAudit(ctx, user._id, "clockodo", "clockodo.link", user.email);
    return { status: "migrated" as const };
  },
});
