import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { isOwnerOrAdmin, requireManager, requireUser } from "./lib/auth";

const pageFields = {
  title: v.string(),
  description: v.string(),
  topic: v.string(),
  teams: v.array(v.string()),
  minRole: v.optional(v.union(v.literal("manager"), v.literal("admin"))),
  blocks: v.string(),
  imageStorageIds: v.array(v.id("_storage")),
};

/** Everything (unfiltered) — the guidebooks list page applies the same
 * team/role access check to these as it does to the hardcoded registry. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("guidebookPages").collect();
    return rows.map((p) => ({
      _id: p._id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      topic: p.topic,
      teams: p.teams,
      minRole: p.minRole ?? null,
    }));
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireUser(ctx);
    const page = await ctx.db
      .query("guidebookPages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!page) return null;
    const author = await ctx.db.get(page.authorUserId);
    return {
      _id: page._id,
      slug: page.slug,
      title: page.title,
      description: page.description,
      topic: page.topic,
      teams: page.teams,
      minRole: page.minRole ?? null,
      blocks: page.blocks,
      authorUserId: page.authorUserId,
      authorName: author ? [author.firstName, author.lastName].filter(Boolean).join(" ") : null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt ?? null,
    };
  },
});

/** Manager+ — the frontend computes a unique slug (checked against both this
 * table and the static registry, which Convex doesn't know about) before
 * calling this; the uniqueness check here is just a defensive race guard. */
export const create = mutation({
  args: { slug: v.string(), ...pageFields },
  handler: async (ctx, args) => {
    const user = await requireManager(ctx);
    const existing = await ctx.db
      .query("guidebookPages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new ConvexError({ code: "conflict", message: "That slug is already taken" });
    }
    const id = await ctx.db.insert("guidebookPages", {
      ...args,
      authorUserId: user._id,
      createdAt: Date.now(),
    });
    return { id, slug: args.slug };
  },
});

export const update = mutation({
  args: { pageId: v.id("guidebookPages"), ...pageFields },
  handler: async (ctx, { pageId, ...patch }) => {
    const user = await requireManager(ctx);
    const page = await ctx.db.get(pageId);
    if (!page) throw new ConvexError({ code: "not_found", message: "Not found" });
    if (!isOwnerOrAdmin(user, page.authorUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the author or an admin can edit this",
      });
    }
    // Images removed from the content are deleted; ones still referenced are
    // left alone (patch.imageStorageIds is the new complete set).
    const keep = new Set(patch.imageStorageIds);
    for (const sid of page.imageStorageIds) {
      if (!keep.has(sid)) await ctx.storage.delete(sid);
    }
    await ctx.db.patch(pageId, { ...patch, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { pageId: v.id("guidebookPages") },
  handler: async (ctx, { pageId }) => {
    const user = await requireManager(ctx);
    const page = await ctx.db.get(pageId);
    if (!page) return { ok: false };
    if (!isOwnerOrAdmin(user, page.authorUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the author or an admin can delete this",
      });
    }
    for (const sid of page.imageStorageIds) {
      await ctx.storage.delete(sid);
    }
    await ctx.db.delete(pageId);
    return { ok: true };
  },
});
