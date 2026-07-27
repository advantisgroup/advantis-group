import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCapability } from "../lib/auth";
import { toClockodoIdString } from "../lib/clockodoId";
import { appError } from "../activity/lib/errors";
import { writeIntegrationsAudit } from "./audit";

/**
 * Single write path for linking an intranet employee to a Clockodo user id.
 * `users.clockodoUserId` is canonical for anyone with an intranet account;
 * `people.clockodoUserId` is what ActivityTrack's poller actually reads
 * (`activity/state.ts`'s `mappings` query), so a linked person's roster row
 * is mirrored here too — otherwise linking through this page would silently
 * do nothing for their live presence signal. Unlinked roster rows (no
 * `userId` — contractors tracked without an intranet login) are untouched by
 * this mutation; they keep using the roster's own free-text editor.
 */
export const linkClockodoUser = mutation({
  args: {
    userId: v.id("users"),
    clockodoUserId: v.number(),
  },
  handler: async (ctx, { userId, clockodoUserId }) => {
    const actor = await requireCapability(ctx, "access_integrations");
    const user = await ctx.db.get(userId);
    if (!user) throw appError("notFound.user", "User not found");

    const clockodoUserIdStr = toClockodoIdString(clockodoUserId);
    await ctx.db.patch(userId, { clockodoUserId: clockodoUserIdStr });

    const person = await ctx.db
      .query("people")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (person) {
      await ctx.db.patch(person._id, {
        clockodoUserId: clockodoUserIdStr,
      });
    }

    await writeIntegrationsAudit(ctx, actor._id, "clockodo", "clockodo.link", user.email);
  },
});

export const unlinkClockodoUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const actor = await requireCapability(ctx, "access_integrations");
    const user = await ctx.db.get(userId);
    if (!user) throw appError("notFound.user", "User not found");

    await ctx.db.patch(userId, { clockodoUserId: undefined });

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
