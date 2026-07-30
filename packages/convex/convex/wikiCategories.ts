import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";

export const PALETTE = [
  "#4A5AB8",
  "#0E8A83",
  "#C77E1A",
  "#4E8A3C",
  "#B2496E",
  "#7A5FBF",
  "#2F7FA6",
  "#A5643B",
  "#5B7A2F",
  "#8A4FA0",
  "#3D6B8F",
  "#B8862B",
];

/** The default categories baked into the ported prototype (DEFAULT_CATS) —
 * seeded once via `ensureDefaults` the first time the wiki has no
 * categories yet, exactly like the prototype's own `if(!cats.length) cats =
 * [...DEFAULT_CATS]` bootstrap. Not re-applied afterward: once a manager
 * has edited/deleted any of these, that's the source of truth. */
const DEFAULT_CATEGORIES = [
  { name: "Advantis intern", color: "#4A5AB8" },
  { name: "Uta Prozesse", color: "#0E8A83" },
  { name: "Sales", color: "#C77E1A" },
  { name: "Onboarding", color: "#4E8A3C" },
  { name: "Customer Care", color: "#B2496E" },
  { name: "Listen", color: "#7A5FBF" },
];

/** Wiki categories (Kategorien), alphabetical. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("wikiCategories").collect();
    return rows
      .map((c) => ({ _id: c._id, name: c.name, color: c.color }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

/** Idempotent — only inserts the defaults when the table is empty (i.e.
 * nobody has created or migrated any category yet). Safe to call from any
 * signed-in session on load; a no-op otherwise. */
export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.query("wikiCategories").first();
    if (existing) return { seeded: false };
    const now = Date.now();
    for (const c of DEFAULT_CATEGORIES) {
      await ctx.db.insert("wikiCategories", {
        name: c.name,
        color: c.color,
        createdByUserId: user._id,
        createdAt: now,
      });
    }
    return { seeded: true };
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireManager(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: "bad_request", message: "Name required" });
    const existing = await ctx.db.query("wikiCategories").collect();
    if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new ConvexError({ code: "conflict", message: "That category already exists" });
    }
    const color =
      PALETTE.find((p) => !existing.some((c) => c.color === p)) ??
      PALETTE[existing.length % PALETTE.length];
    const id = await ctx.db.insert("wikiCategories", {
      name: trimmed,
      color,
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const rename = mutation({
  args: { categoryId: v.id("wikiCategories"), name: v.string() },
  handler: async (ctx, { categoryId, name }) => {
    await requireManager(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: "bad_request", message: "Name required" });
    await ctx.db.patch(categoryId, { name: trimmed });
    return { ok: true };
  },
});

/** Cycles to the next palette colour — mirrors the ported prototype's
 * "click the dot to change colour" interaction. */
export const cycleColor = mutation({
  args: { categoryId: v.id("wikiCategories") },
  handler: async (ctx, { categoryId }) => {
    await requireManager(ctx);
    const category = await ctx.db.get(categoryId);
    if (!category) return { ok: false };
    const next = PALETTE[(PALETTE.indexOf(category.color) + 1) % PALETTE.length];
    await ctx.db.patch(categoryId, { color: next });
    return { ok: true, color: next };
  },
});

/** Deleting a category snapshots its name onto affected entries
 * (`categoryName`) and unpins them, moving them into the "expired" archive
 * view instead of pointing at nothing. */
export const remove = mutation({
  args: { categoryId: v.id("wikiCategories") },
  handler: async (ctx, { categoryId }) => {
    await requireManager(ctx);
    const category = await ctx.db.get(categoryId);
    if (!category) return { ok: false };
    const affected = await ctx.db
      .query("wikiEntries")
      .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
      .collect();
    for (const e of affected) {
      await ctx.db.patch(e._id, { categoryId: undefined, categoryName: category.name, pinned: false });
    }
    await ctx.db.delete(categoryId);
    return { ok: true };
  },
});
