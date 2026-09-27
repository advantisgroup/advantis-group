import { userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { capabilityValidator } from "../schema";
import { MAX_DAILY_RUN_LIMIT, isValidDailyRunLimit } from "../lib/aiRuns";
import { effectiveCustomRoleIds, type Capability } from "../lib/auth";

/**
 * Manager-defined roles (e.g. "Team Lead") that grant a scoped set of
 * capabilities on top of a user's base admin/manager/employee tier — see
 * `lib/auth.ts`'s `requireCapability`. Creating/editing/assigning a custom
 * role is manager+ (not admin-only): a capability like `manage_members` is
 * narrower than the manager tier itself, so letting managers grant it doesn't
 * hand out anything they don't already have.
 */

/**
 * Capabilities are normally independent, but `manage_clockodo_team` is the
 * first write/read pair in this system — granting write without the
 * matching read would be a nonsensical, easy-to-misconfigure state. Enforced
 * here at write time (not at every read-site) so every downstream check can
 * stay a plain `capabilities.includes(x)` with no pairing to know about.
 */
const CAPABILITY_IMPLIES: Partial<Record<Capability, Capability[]>> = {
  manage_clockodo_team: ["view_clockodo_team"],
};

function normalizeCapabilities(capabilities: Capability[]): Capability[] {
  const set = new Set(capabilities);
  for (const capability of capabilities) {
    for (const implied of CAPABILITY_IMPLIES[capability] ?? []) set.add(implied);
  }
  return [...set];
}

/** Everyone still in the org who holds each role. `users` is org-sized, so
 * one scan covers every role at once. */
async function holdersByRole(ctx: QueryCtx) {
  const holders = new Map<Id<"customRoles">, Doc<"users">[]>();
  for (const user of await ctx.db.query("users").collect()) {
    if (user.status === "removed") continue;
    for (const roleId of effectiveCustomRoleIds(user)) {
      holders.set(roleId, [...(holders.get(roleId) ?? []), user]);
    }
  }
  return holders;
}

export const list = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
    const roles = await ctx.db.query("customRoles").collect();
    const holders = await holdersByRole(ctx);
    return roles.map((role) => ({
      ...role,
      memberIds: (holders.get(role._id) ?? []).map((user) => user._id),
    }));
  },
});

export const get = userQuery({
  role: "manager",
  args: { customRoleId: v.string() },
  handler: async (ctx, { customRoleId }) => {
    const id = ctx.db.normalizeId("customRoles", customRoleId);
    const role = id ? await ctx.db.get(id) : null;
    if (!role) return null;
    const holders = await holdersByRole(ctx);
    return {
      ...role,
      // The base role too, so the page can say who'd have all of it anyway.
      members: (holders.get(role._id) ?? []).map((user) => ({
        userId: user._id,
        role: user.role,
      })),
    };
  },
});

async function requireRoleAndUser(
  ctx: MutationCtx,
  customRoleId: Id<"customRoles">,
  userId: Id<"users">,
) {
  const [role, user] = await Promise.all([ctx.db.get(customRoleId), ctx.db.get(userId)]);
  if (!role) throw new ConvexError({ code: "not_found", message: "Role not found" });
  if (!user) throw new ConvexError({ code: "not_found", message: "User not found" });
  return user;
}

export const addMember = userMutation({
  role: "manager",
  args: { customRoleId: v.id("customRoles"), userId: v.id("users") },
  handler: async (ctx, { customRoleId, userId }) => {
    const user = await requireRoleAndUser(ctx, customRoleId, userId);
    const ids = effectiveCustomRoleIds(user);
    if (ids.includes(customRoleId)) return null;
    await ctx.db.patch(userId, { customRoleIds: [...ids, customRoleId], customRoleId: undefined });
    return null;
  },
});

export const removeMember = userMutation({
  role: "manager",
  args: { customRoleId: v.id("customRoles"), userId: v.id("users") },
  handler: async (ctx, { customRoleId, userId }) => {
    const user = await requireRoleAndUser(ctx, customRoleId, userId);
    await ctx.db.patch(userId, {
      customRoleIds: effectiveCustomRoleIds(user).filter((id) => id !== customRoleId),
      customRoleId: undefined,
    });
    return null;
  },
});

export const create = userMutation({
  role: "manager",
  args: {
    name: v.string(),
    capabilities: v.array(capabilityValidator),
  },
  handler: async (ctx, { name, capabilities }) => {
    const actor = ctx.caller.user;
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({
        code: "bad_request",
        message: "Name is required",
      });
    }
    return ctx.db.insert("customRoles", {
      name: trimmed,
      capabilities: normalizeCapabilities(capabilities),
      createdBy: actor._id,
      createdAt: Date.now(),
    });
  },
});

export const update = userMutation({
  role: "manager",
  args: {
    customRoleId: v.id("customRoles"),
    name: v.optional(v.string()),
    capabilities: v.optional(v.array(capabilityValidator)),
    // null goes back to the workspace default.
    aiDailyLimit: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { customRoleId, name, capabilities, aiDailyLimit }) => {
    const role = await ctx.db.get(customRoleId);
    if (!role) {
      throw new ConvexError({ code: "not_found", message: "Role not found" });
    }
    if (typeof aiDailyLimit === "number" && !isValidDailyRunLimit(aiDailyLimit)) {
      throw new ConvexError({
        code: "bad_request",
        message: `The limit has to be a whole number between 1 and ${MAX_DAILY_RUN_LIMIT}`,
      });
    }
    await ctx.db.patch(customRoleId, {
      ...(name !== undefined ? { name: name.trim() || role.name } : {}),
      ...(capabilities !== undefined ? { capabilities: normalizeCapabilities(capabilities) } : {}),
      ...(aiDailyLimit !== undefined ? { aiDailyLimit: aiDailyLimit ?? undefined } : {}),
    });
  },
});

export const remove = userMutation({
  role: "manager",
  args: { customRoleId: v.id("customRoles") },
  handler: async (ctx, { customRoleId }) => {
    const role = await ctx.db.get(customRoleId);
    if (!role) {
      throw new ConvexError({ code: "not_found", message: "Role not found" });
    }
    // Unassign from anyone currently holding it before deleting the role
    // itself, so `users.customRoleIds` never dangles. No index on this
    // field — a full scan is fine for an infrequent admin action.
    const allUsers = await ctx.db.query("users").collect();
    for (const holder of allUsers) {
      const ids = effectiveCustomRoleIds(holder);
      if (ids.includes(customRoleId)) {
        await ctx.db.patch(holder._id, {
          customRoleIds: ids.filter((id) => id !== customRoleId),
          customRoleId: undefined,
        });
      }
    }
    await ctx.db.delete(customRoleId);
  },
});
