import { userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";
/** Fehlerkategorien (Stammdaten), alphabetical. */
export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("errorCategories").collect();
    return rows
      .map((c) => ({ _id: c._id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

export const create = userMutation({
  role: "manager",
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = ctx.caller.user;
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: "bad_request", message: "Name required" });
    const existing = await ctx.db.query("errorCategories").collect();
    if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new ConvexError({ code: "conflict", message: "That category already exists" });
    }
    const id = await ctx.db.insert("errorCategories", {
      name: trimmed,
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const rename = userMutation({
  role: "manager",
  args: { categoryId: v.id("errorCategories"), name: v.string() },
  handler: async (ctx, { categoryId, name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: "bad_request", message: "Name required" });
    await ctx.db.patch(categoryId, { name: trimmed });
    return { ok: true };
  },
});

/** Deleting a category snapshots its name onto affected reports (`categoryName`)
 * so their history stays legible instead of pointing at nothing. */
export const remove = userMutation({
  role: "manager",
  args: { categoryId: v.id("errorCategories") },
  handler: async (ctx, { categoryId }) => {
    const category = await ctx.db.get(categoryId);
    if (!category) return { ok: false };
    const affected = await ctx.db
      .query("errorReports")
      .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
      .collect();
    for (const r of affected) {
      await ctx.db.patch(r._id, { categoryId: undefined, categoryName: category.name });
    }
    await ctx.db.delete(categoryId);
    return { ok: true };
  },
});
