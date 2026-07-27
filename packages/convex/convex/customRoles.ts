import { ConvexError, v } from "convex/values";

import { capabilityValidator } from "./schema";
import { mutation, query } from "./_generated/server";
import { requireManager } from "./lib/auth";

/**
 * Manager-defined roles (e.g. "Team Lead") that grant a scoped set of
 * capabilities on top of a user's base admin/manager/employee tier — see
 * `lib/auth.ts`'s `requireCapability`. Creating/editing/assigning a custom
 * role is manager+ (not admin-only): a capability like `manage_members` is
 * narrower than the manager tier itself, so letting managers grant it doesn't
 * hand out anything they don't already have.
 */

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireManager(ctx);
    return ctx.db.query("customRoles").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    capabilities: v.array(capabilityValidator),
  },
  handler: async (ctx, { name, capabilities }) => {
    const actor = await requireManager(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({
        code: "bad_request",
        message: "Name is required",
      });
    }
    return ctx.db.insert("customRoles", {
      name: trimmed,
      capabilities,
      createdBy: actor._id,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    customRoleId: v.id("customRoles"),
    name: v.optional(v.string()),
    capabilities: v.optional(v.array(capabilityValidator)),
  },
  handler: async (ctx, { customRoleId, name, capabilities }) => {
    await requireManager(ctx);
    const role = await ctx.db.get(customRoleId);
    if (!role) {
      throw new ConvexError({ code: "not_found", message: "Role not found" });
    }
    await ctx.db.patch(customRoleId, {
      ...(name !== undefined ? { name: name.trim() || role.name } : {}),
      ...(capabilities !== undefined ? { capabilities } : {}),
    });
  },
});

export const remove = mutation({
  args: { customRoleId: v.id("customRoles") },
  handler: async (ctx, { customRoleId }) => {
    await requireManager(ctx);
    const role = await ctx.db.get(customRoleId);
    if (!role) {
      throw new ConvexError({ code: "not_found", message: "Role not found" });
    }
    // Unassign from anyone currently holding it before deleting the role
    // itself, so `users.customRoleId` never dangles. No index on this field —
    // a full scan is fine for an infrequent admin action.
    const allUsers = await ctx.db.query("users").collect();
    for (const holder of allUsers) {
      if (holder.customRoleId === customRoleId) {
        await ctx.db.patch(holder._id, { customRoleId: undefined });
      }
    }
    await ctx.db.delete(customRoleId);
  },
});
