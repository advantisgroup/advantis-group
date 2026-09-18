import { v } from "convex/values";

import { query } from "../functions";
import { requireCapability } from "../lib/auth";
import { toClockodoIdString } from "../lib/clockodoId";

/**
 * Every intranet user, joined to their Clockodo link (if any), ActivityTrack
 * roster row (if any) and tracked device (if any) — one round trip instead
 * of the client doing several sequential lookups per row. `deviceId` is the
 * agent-minted UUID string used by the `timeline/[deviceId]` route, not the
 * Convex document id.
 *
 * Previously filtered out every not-yet-linked user, so an admin could never
 * see who *isn't* connected to Clockodo from this list. Follows the
 * subprofile enrichment convention (`docs/architecture/profiles.md`): every
 * user gets a row, `linked` says whether the Clockodo fields are populated.
 */
export const listWithLinks = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      email: v.string(),
      linked: v.boolean(),
      clockodoUserId: v.union(v.string(), v.null()),
      personId: v.union(v.id("people"), v.null()),
      deviceId: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireCapability(ctx, "manage_clockodo_team");
    const users = await ctx.db.query("users").collect();

    return await Promise.all(
      users.map(async (u) => {
        const person = await ctx.db
          .query("people")
          .withIndex("by_userId", (q) => q.eq("userId", u._id))
          .first();
        const device = person
          ? await ctx.db
              .query("devices")
              .withIndex("by_personId", (q) => q.eq("personId", person._id))
              .first()
          : null;
        // Normalize legacy `number` rows (pending backfill) to `string`.
        const clockodoUserId =
          typeof u.clockodoUserId === "number"
            ? toClockodoIdString(u.clockodoUserId)
            : (u.clockodoUserId ?? null);
        return {
          userId: u._id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
          email: u.email,
          linked: clockodoUserId !== null,
          clockodoUserId,
          personId: person?._id ?? null,
          deviceId: device?.deviceId ?? null,
        };
      }),
    );
  },
});
