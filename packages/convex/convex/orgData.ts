import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";

/**
 * Ongoing management of the canonical `departments`/`teams` tables (see
 * `orgDataMigration.ts` for how existing free-text values were first turned
 * into rows). This module is for admins creating/renaming/archiving entries
 * going forward — it never touches `users.department`/`users.teams` or the
 * migration review queue.
 *
 * Archive, never delete: a department/team can be referenced by
 * `users.departmentId` / `userTeams` rows that must stay resolvable, so
 * removal only ever sets `archivedAt` and read paths filter it out.
 */

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

async function assertUniqueName(
  ctx: MutationCtx,
  table: "departments" | "teams",
  name: string,
  excludeId?: Id<"departments"> | Id<"teams">,
): Promise<void> {
  const target = normalize(name);
  const rows =
    table === "departments"
      ? await ctx.db.query("departments").collect()
      : await ctx.db.query("teams").collect();
  const clash = rows.find(
    (r) => r._id !== excludeId && r.archivedAt === undefined && normalize(r.name) === target,
  );
  if (clash) {
    throw new ConvexError({
      code: "bad_request",
      message: `"${name.trim()}" already exists`,
    });
  }
}

export const listDepartments = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("departments").collect();
    return rows
      .filter((r) => includeArchived || r.archivedAt === undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createDepartment = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const admin = await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Name required" });
    }
    await assertUniqueName(ctx, "departments", trimmed);
    return await ctx.db.insert("departments", {
      name: trimmed,
      createdAt: Date.now(),
      createdBy: admin._id,
    });
  },
});

export const renameDepartment = mutation({
  args: { departmentId: v.id("departments"), name: v.string() },
  handler: async (ctx, { departmentId, name }) => {
    await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Name required" });
    }
    const existing = await ctx.db.get(departmentId);
    if (!existing) {
      throw new ConvexError({
        code: "not_found",
        message: "Department not found",
      });
    }
    await assertUniqueName(ctx, "departments", trimmed, departmentId);
    await ctx.db.patch(departmentId, { name: trimmed });
  },
});

export const archiveDepartment = mutation({
  args: { departmentId: v.id("departments"), archived: v.boolean() },
  handler: async (ctx, { departmentId, archived }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(departmentId, {
      archivedAt: archived ? Date.now() : undefined,
    });
  },
});

export const listTeams = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("teams").collect();
    const filtered = rows.filter((r) => includeArchived || r.archivedAt === undefined);
    const memberships = await ctx.db.query("userTeams").collect();
    const countByTeam = new Map<string, number>();
    for (const m of memberships) {
      countByTeam.set(m.teamId, (countByTeam.get(m.teamId) ?? 0) + 1);
    }
    return filtered
      .map((r) => ({ ...r, memberCount: countByTeam.get(r._id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "team"
  );
}

export const createTeam = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const admin = await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Name required" });
    }
    await assertUniqueName(ctx, "teams", trimmed);
    return await ctx.db.insert("teams", {
      name: trimmed,
      slug: slugify(trimmed),
      createdAt: Date.now(),
      createdBy: admin._id,
    });
  },
});

export const renameTeam = mutation({
  args: { teamId: v.id("teams"), name: v.string() },
  handler: async (ctx, { teamId, name }) => {
    await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Name required" });
    }
    const existing = await ctx.db.get(teamId);
    if (!existing) {
      throw new ConvexError({ code: "not_found", message: "Team not found" });
    }
    await assertUniqueName(ctx, "teams", trimmed, teamId);
    // Slug is left untouched on rename — it's the stable id guidebook access
    // rules reference (see schema.ts's `teams` comment), not a display label.
    await ctx.db.patch(teamId, { name: trimmed });
  },
});

export const archiveTeam = mutation({
  args: { teamId: v.id("teams"), archived: v.boolean() },
  handler: async (ctx, { teamId, archived }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(teamId, {
      archivedAt: archived ? Date.now() : undefined,
    });
  },
});
