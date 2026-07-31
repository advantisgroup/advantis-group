import { api } from "@advantis/convex/api";

import { getConvex, getConvexServerKey } from "./convex.js";
import { Errors } from "./errors.js";
import { requireAuth } from "./middleware.js";

/** Resolves the calling Clerk user to their linked Clockodo account,
 * rejecting anyone without one — shared by every route that needs to act
 * as "this employee's own Clockodo account" (clock in/out, personal
 * absences, personal time entries), as opposed to the team-access reads
 * in clockodo-absences.ts that also accept view/manage_clockodo_team
 * holders without a personal link. */
export async function resolveClockodoCaller(request: Request) {
  const { clerkUserId } = await requireAuth(request);
  const caller = await getConvex().query(
    api.integrations.clockodoAbsences.resolveCaller,
    {
      serverKey: getConvexServerKey(),
      clerkUserId,
    }
  );
  if (caller.status !== "linked") {
    throw Errors.forbidden("Clockodo account is not linked");
  }
  const clockodoUserId = Number(caller.clockodoUserId);
  if (!Number.isSafeInteger(clockodoUserId)) {
    throw Errors.forbidden("Clockodo account is not linked");
  }
  return { ...caller, clockodoUserId };
}
