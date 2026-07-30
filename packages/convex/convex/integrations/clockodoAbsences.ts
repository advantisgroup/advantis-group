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
 *
 * Both queries below follow the subprofile enrichment convention (see
 * `docs/architecture/profiles.md`): a Clockodo link may or may not exist for
 * a given intranet user, and callers need to tell "no intranet account" and
 * "intranet account with no Clockodo link" apart rather than getting a bare
 * `null` for either.
 */
function assertServerKey(serverKey: string) {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

export const clockodoCallerValidator = v.union(
  /** No intranet account matches the Clerk identity at all. */
  v.object({ status: v.literal("no_account") }),
  /** An intranet account exists but has no Clockodo link yet. */
  v.object({
    status: v.literal("unlinked"),
    userId: v.id("users"),
    name: v.string(),
    isManager: v.boolean(),
  }),
  /** An intranet account exists and is linked to a Clockodo user. */
  v.object({
    status: v.literal("linked"),
    userId: v.id("users"),
    name: v.string(),
    clockodoUserId: v.string(),
    isManager: v.boolean(),
  }),
);

/** The calling user's own Clockodo subprofile — always one of the three
 *  `clockodoCallerValidator` shapes above, never a bare `null`. */
export const resolveCaller = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  returns: clockodoCallerValidator,
  handler: async (ctx, { serverKey, clerkUserId }) => {
    assertServerKey(serverKey);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (!user) return { status: "no_account" as const };

    const name = user.firstName ?? user.email;
    const isManager = MANAGER_ROLES.includes(user.role);
    const clockodoUserId =
      typeof user.clockodoUserId === "number"
        ? toClockodoIdString(user.clockodoUserId)
        : (user.clockodoUserId ?? null);

    if (!clockodoUserId) {
      return { status: "unlinked" as const, userId: user._id, name, isManager };
    }
    return { status: "linked" as const, userId: user._id, name, clockodoUserId, isManager };
  },
});

/** Every active user, for joining the org-wide calendar — Clockodo-linked or
 *  not. Callers that only care about linked people should filter on
 *  `linked` themselves rather than this query silently omitting rows. */
export const roster = query({
  args: { serverKey: v.string() },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      department: v.union(v.string(), v.null()),
      linked: v.boolean(),
      clockodoUserId: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const users = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return users.map((u) => {
      const clockodoUserId =
        typeof u.clockodoUserId === "number"
          ? toClockodoIdString(u.clockodoUserId)
          : (u.clockodoUserId ?? null);
      return {
        userId: u._id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
        department: u.department ?? null,
        linked: clockodoUserId !== null,
        clockodoUserId,
      };
    });
  },
});
