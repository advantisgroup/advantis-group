import { ConvexError, v } from "convex/values";

import { query } from "../_generated/server";
import { MANAGER_ROLES } from "../lib/auth";
import { toClockodoIdString } from "../lib/clockodoId";

/**
 * Server-key gated lookups the Elysia API uses to join live-fetched Clockodo
 * absences against the intranet roster, without storing a mirror of the
 * absences themselves (see AGENTS.md's Clockodo section) — apps/api resolves
 * the caller's Clerk session, then calls these to learn who that person is
 * (and, for the calendar, who everyone else is) before hitting Clockodo.
 */
function assertServerKey(serverKey: string) {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

/** The calling user's own clockodoUserId (if linked) — for "my absences". */
export const resolveCaller = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  handler: async (ctx, { serverKey, clerkUserId }) => {
    assertServerKey(serverKey);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (!user) return null;
    const clockodoUserId =
      typeof user.clockodoUserId === "number"
        ? toClockodoIdString(user.clockodoUserId)
        : (user.clockodoUserId ?? null);
    return {
      userId: user._id,
      name: user.firstName ?? user.email,
      clockodoUserId,
      isManager: MANAGER_ROLES.includes(user.role),
    };
  },
});

/** Every active, Clockodo-linked user — for joining the org-wide calendar. */
export const roster = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return users
      .filter((u) => u.clockodoUserId != null)
      .map((u) => ({
        userId: u._id,
        clockodoUserId:
          typeof u.clockodoUserId === "number"
            ? toClockodoIdString(u.clockodoUserId)
            : u.clockodoUserId!,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        department: u.department ?? null,
      }));
  },
});
