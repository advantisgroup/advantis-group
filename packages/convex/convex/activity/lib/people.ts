import { v, type Infer } from "convex/values";
import { type Id } from "../../_generated/dataModel";
import { type QueryCtx, type MutationCtx } from "../../_generated/server";

export const activitySubprofileValidator = v.object({
  linked: v.boolean(),
  personId: v.union(v.id("people"), v.null()),
  employeeId: v.union(v.string(), v.null()),
  genesysUserId: v.union(v.string(), v.null()),
  clockodoUserId: v.union(v.string(), v.null()),
});

export type ActivitySubprofile = Infer<typeof activitySubprofileValidator>;

/**
 * ActivityTrack's subprofile for a profile (intranet `users` row): the
 * `people` roster row that links them into device/Genesys/Clockodo tracking,
 * if any. Previously each of `state.ts`'s `myState`/`stateBatch`/
 * `historyBatch` independently ran this same `people.by_userId` lookup —
 * this is the one place that join happens.
 */
export async function getActivitySubprofile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<ActivitySubprofile> {
  const person = await ctx.db
    .query("people")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return {
    linked: person !== null,
    personId: person?._id ?? null,
    employeeId: person?.employeeId ?? null,
    genesysUserId: person?.genesysUserId ?? null,
    clockodoUserId: person?.clockodoUserId ?? null,
  };
}
