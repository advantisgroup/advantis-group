import { query } from "../_generated/server";
import { requireCapability } from "../lib/auth";

/**
 * Every intranet user linked to a Clockodo account, joined to their
 * ActivityTrack roster row (if any) and tracked device (if any) — one round
 * trip instead of the client doing three sequential lookups per row.
 * `deviceId` is the agent-minted UUID string used by the
 * `timeline/[deviceId]` route, not the Convex document id.
 */
export const listWithLinks = query({
  args: {},
  handler: async ctx => {
    await requireCapability(ctx, "access_integrations");
    const users = await ctx.db.query("users").collect();
    const linked = users.filter(u => u.clockodoUserId !== undefined);

    return await Promise.all(
      linked.map(async u => {
        const person = await ctx.db
          .query("people")
          .withIndex("by_userId", q => q.eq("userId", u._id))
          .first();
        const device = person
          ? await ctx.db
              .query("devices")
              .withIndex("by_personId", q => q.eq("personId", person._id))
              .first()
          : null;
        return {
          userId: u._id,
          name:
            [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
            u.email,
          email: u.email,
          clockodoUserId: u.clockodoUserId!,
          personId: person?._id ?? null,
          deviceId: device?.deviceId ?? null,
        };
      })
    );
  },
});
