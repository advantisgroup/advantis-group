import { v } from "convex/values";

import { userQuery } from "../functions";
import { toClockodoIdString } from "../lib/clockodoId";

/**
 * Every intranet user, joined to their Clockodo link (if any).
 *
 * Previously filtered out every not-yet-linked user, so an admin could never
 * see who *isn't* connected to Clockodo from this list. Follows the
 * subprofile enrichment convention (`docs/architecture/profiles.md`): every
 * user gets a row, `linked` says whether the Clockodo fields are populated.
 */
export const listWithLinks = userQuery({
  can: "manage_clockodo_team",
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      email: v.string(),
      linked: v.boolean(),
      clockodoUserId: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const users = (await ctx.db.query("users").collect()).filter((u) => u.status !== "removed");

    return users.map((u) => {
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
      };
    });
  },
});
