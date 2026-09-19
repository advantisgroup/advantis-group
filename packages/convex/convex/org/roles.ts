import { userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { capabilityValidator } from "../schema";
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

export const list = userQuery({
  role: "manager",
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("customRoles").collect();
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
  },
  handler: async (ctx, { customRoleId, name, capabilities }) => {
    const role = await ctx.db.get(customRoleId);
    if (!role) {
      throw new ConvexError({ code: "not_found", message: "Role not found" });
    }
    await ctx.db.patch(customRoleId, {
      ...(name !== undefined ? { name: name.trim() || role.name } : {}),
      ...(capabilities !== undefined ? { capabilities: normalizeCapabilities(capabilities) } : {}),
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
