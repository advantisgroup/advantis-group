import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";

/**
 * Admin-managed taxonomy for `suggestions.categoryId` — mirrors
 * `orgData.ts`'s department CRUD (archive, never delete, so a category
 * referenced by existing suggestions stays resolvable).
 */

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

async function assertUniqueName(
  ctx: MutationCtx,
  name: string,
  excludeId?: Id<"suggestionCategories">,
): Promise<void> {
  const target = normalize(name);
  const rows = await ctx.db.query("suggestionCategories").collect();
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

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("suggestionCategories").collect();
    return rows
      .filter((r) => includeArchived || r.archivedAt === undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const admin = await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Name required" });
    }
    await assertUniqueName(ctx, trimmed);
    return await ctx.db.insert("suggestionCategories", {
      name: trimmed,
      createdAt: Date.now(),
      createdBy: admin._id,
    });
  },
});

export const rename = mutation({
  args: { categoryId: v.id("suggestionCategories"), name: v.string() },
  handler: async (ctx, { categoryId, name }) => {
    await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Name required" });
    }
    const existing = await ctx.db.get(categoryId);
    if (!existing) {
      throw new ConvexError({ code: "not_found", message: "Category not found" });
    }
    await assertUniqueName(ctx, trimmed, categoryId);
    await ctx.db.patch(categoryId, { name: trimmed });
  },
});

export const archive = mutation({
  args: { categoryId: v.id("suggestionCategories"), archived: v.boolean() },
  handler: async (ctx, { categoryId, archived }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(categoryId, {
      archivedAt: archived ? Date.now() : undefined,
    });
  },
});
