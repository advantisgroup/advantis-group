import { mutation, query } from "./functions";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { isPermission } from "./performance/lib/permissions";
import { requireAdminLogin, requirePermission, resolveActiveSession } from "./lib/performanceAuth";

/**
 * Per-company role CRUD — the customization surface behind "edit permissions
 * or create roles under certain companies" (see the roles admin UI,
 * `apps/intranet/src/app/performance/admin/roles/page.tsx`). Every company
 * starts with three built-in roles seeded at creation time
 * (`companies.upsertProvisioningRow`); this file is what lets a company's own
 * admin (or a cross-company super-admin) reshape them or add new ones with
 * no engineering involved.
 */

function validatePermissions(permissions: string[]): void {
  const bad = permissions.filter((p) => !isPermission(p));
  if (bad.length > 0) {
    throw new ConvexError({
      code: "validation",
      message: `Unknown permission(s): ${bad.join(", ")}`,
    });
  }
}

/** Resolves which company's roles the caller is allowed to act on: an
 * explicitly passed `companyId` always wins (the roles UI's company
 * picker, for a super-admin managing another company's roles), otherwise
 * the caller's own `companyId` — including a super-admin backfilled from
 * an existing company login (see `resolveCompanyId` in performanceAuth.ts
 * for the same reasoning). Only a super-admin with no company at all
 * requires the explicit arg. */
async function resolveTargetCompanyId(
  admin: Doc<"performanceLogins">,
  companyId: Id<"companies"> | undefined,
): Promise<Id<"companies">> {
  const targetCompanyId = companyId ?? admin.companyId;
  if (!targetCompanyId) {
    throw new ConvexError({
      code: "validation",
      message: "companyId is required.",
    });
  }
  return targetCompanyId;
}

export const list = query({
  args: { token: v.string(), companyId: v.optional(v.id("companies")) },
  handler: async (ctx, { token, companyId }) => {
    const admin = await requireAdminLogin(ctx, token);
    const targetCompanyId = await resolveTargetCompanyId(admin, companyId);
    const roles = await ctx.db
      .query("companyRoles")
      .withIndex("by_company", (q) => q.eq("companyId", targetCompanyId))
      .collect();
    return roles
      .map((r) => ({
        id: r._id,
        name: r.name,
        permissions: r.permissions,
        isBuiltIn: r.isBuiltIn,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    companyId: v.optional(v.id("companies")),
    name: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, { token, companyId, name, permissions }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (!resolved) {
      throw new ConvexError({
        code: "unauthenticated",
        message: "Please sign in.",
      });
    }
    const targetCompanyId = await resolveTargetCompanyId(resolved.login, companyId);
    await requirePermission(ctx, resolved.login, "manage_roles", targetCompanyId);

    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({
        code: "validation",
        message: "Name is required.",
      });
    }
    validatePermissions(permissions);

    return await ctx.db.insert("companyRoles", {
      companyId: targetCompanyId,
      name: trimmed,
      permissions,
      isBuiltIn: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    roleId: v.id("companyRoles"),
    name: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { token, roleId, name, permissions }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (!resolved) {
      throw new ConvexError({
        code: "unauthenticated",
        message: "Please sign in.",
      });
    }
    const role = await ctx.db.get(roleId);
    if (!role) {
      throw new ConvexError({ code: "not_found", message: "Role not found." });
    }
    await requirePermission(ctx, resolved.login, "manage_roles", role.companyId);

    if (permissions !== undefined) validatePermissions(permissions);

    await ctx.db.patch(roleId, {
      ...(name !== undefined ? { name: name.trim() || role.name } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
    });
    return { ok: true };
  },
});

/** Custom (non-built-in) roles only — a built-in role always exists so a
 * company can never end up with zero usable roles. Blocked while any login
 * still holds the role, since `performanceLogins.roleId` is required for
 * every non-super-admin login (no "unassigned" state to fall back to);
 * reassign those logins to a different role first. */
export const remove = mutation({
  args: { token: v.string(), roleId: v.id("companyRoles") },
  handler: async (ctx, { token, roleId }) => {
    const resolved = await resolveActiveSession(ctx, token);
    if (!resolved) {
      throw new ConvexError({
        code: "unauthenticated",
        message: "Please sign in.",
      });
    }
    const role = await ctx.db.get(roleId);
    if (!role) {
      throw new ConvexError({ code: "not_found", message: "Role not found." });
    }
    await requirePermission(ctx, resolved.login, "manage_roles", role.companyId);

    if (role.isBuiltIn) {
      throw new ConvexError({
        code: "forbidden",
        message: "Built-in roles can't be deleted.",
      });
    }

    const holders = await ctx.db
      .query("performanceLogins")
      .withIndex("by_company_email", (q) => q.eq("companyId", role.companyId))
      .collect();
    if (holders.some((h) => h.roleId === roleId)) {
      throw new ConvexError({
        code: "role_in_use",
        message: "Reassign every login holding this role before deleting it.",
      });
    }

    await ctx.db.delete(roleId);
    return { ok: true };
  },
});
