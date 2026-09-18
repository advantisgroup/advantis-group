import { mutation, query } from "../functions";
import { v, type Infer } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type QueryCtx, type MutationCtx } from "../_generated/server";
import { requireUser, requireCapability } from "../lib/auth";
import { writeAudit } from "./audit";
import { appError } from "./lib/errors";

/** All people (coworkers being tracked). Any signed-in user. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("people").take(2000);
  },
});

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

/** Treat empty string as "clear it" (undefined); trim otherwise. */
function normalizeId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Add a coworker. Manager+, or a `manage_members` custom role. */
export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    employeeId: v.optional(v.string()),
    genesysUserId: v.optional(v.string()),
    clockodoUserId: v.optional(v.string()),
  },
  handler: async (ctx, { name, email, userId, employeeId, genesysUserId, clockodoUserId }) => {
    const actor = await requireCapability(ctx, "manage_members");
    const id = await ctx.db.insert("people", {
      name,
      email,
      userId,
      active: true,
      employeeId: normalizeId(employeeId),
      genesysUserId: normalizeId(genesysUserId),
      clockodoUserId: normalizeId(clockodoUserId),
    });
    await writeAudit(ctx, actor._id, "person.create", name);
    return id;
  },
});

/** Edit a coworker's details / active flag / integration mappings. Manager+, or a `manage_members` custom role. */
export const update = mutation({
  args: {
    personId: v.id("people"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    userId: v.optional(v.union(v.id("users"), v.null())),
    active: v.optional(v.boolean()),
    employeeId: v.optional(v.string()),
    genesysUserId: v.optional(v.string()),
    clockodoUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { personId, name, email, userId, active, employeeId, genesysUserId, clockodoUserId } =
      args;
    const actor = await requireCapability(ctx, "manage_members");
    const person = await ctx.db.get(personId);
    if (!person) throw appError("notFound.person", "Person not found");
    // Once a person is linked to an intranet account, `users.clockodoUserId`
    // is canonical (see `integrations/clockodoLink.ts`) — editing the roster
    // copy directly here is exactly how the two fields drifted before (this
    // one a string, `users`' a number). Route through Admin → Integrations
    // instead so there's a single writer.
    if (clockodoUserId !== undefined && person.userId) {
      throw appError(
        "clockodo.managedElsewhere",
        "This person is linked to an intranet account — manage their Clockodo id from Admin → Integrations → Clockodo instead.",
      );
    }
    await ctx.db.patch(personId, {
      ...(name !== undefined ? { name } : {}),
      // Empty string clears the address (patching to undefined drops the field).
      ...(email !== undefined ? { email: normalizeId(email) } : {}),
      ...(userId !== undefined ? { userId: userId ?? undefined } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(employeeId !== undefined ? { employeeId: normalizeId(employeeId) } : {}),
      ...(genesysUserId !== undefined ? { genesysUserId: normalizeId(genesysUserId) } : {}),
      ...(clockodoUserId !== undefined ? { clockodoUserId: normalizeId(clockodoUserId) } : {}),
    });
    await writeAudit(ctx, actor._id, "person.update", person.name);
  },
});

/** Remove a coworker and unlink any devices pointing at them. Manager+, or a `manage_members` custom role. */
export const remove = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const actor = await requireCapability(ctx, "manage_members");
    const person = await ctx.db.get(personId);
    if (!person) throw appError("notFound.person", "Person not found");

    const linked = await ctx.db
      .query("devices")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect();
    for (const d of linked) {
      await ctx.db.patch(d._id, { personId: undefined });
    }

    await ctx.db.delete(personId);
    await writeAudit(ctx, actor._id, "person.remove", person.name);
  },
});
