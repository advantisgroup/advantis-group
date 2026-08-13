import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import { isOwnerOrAdmin, requireCapability, requireUser } from "./lib/auth";
import { displayName } from "./lib/users";

const MAX_PINS = 5;

/** Everything (unfiltered) — the wiki list page applies filtering/sorting
 * (category, tags, search, pinned-first, expired archive) itself. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("wikiEntries").collect();
    const categories = await ctx.db.query("wikiCategories").collect();
    const catById = new Map(categories.map((c) => [c._id, c]));
    return Promise.all(
      rows.map(async (e) => {
        const cat = e.categoryId ? catById.get(e.categoryId) : undefined;
        const ownerUserId = e.ownerUserId ?? e.authorUserId;
        const owner = await ctx.db.get(ownerUserId);
        return {
          _id: e._id,
          slug: e.slug,
          categoryId: e.categoryId ?? null,
          categoryName: cat ? cat.name : (e.categoryName ?? null),
          categoryColor: cat ? cat.color : null,
          categoryDeleted: !e.categoryId && !!e.categoryName,
          thema: e.thema,
          erklaerung: e.erklaerung,
          tags: e.tags,
          link: e.link ?? null,
          validFrom: e.validFrom,
          validUntil: e.validUntil,
          version: e.version,
          pinned: e.pinned,
          authorName: e.authorName,
          authorUserId: e.authorUserId,
          ownerUserId,
          ownerName: displayName(owner),
          ownerAssigned: e.ownerUserId !== undefined,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        };
      }),
    );
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!row) return null;
    const category = row.categoryId ? await ctx.db.get(row.categoryId) : null;
    const ownerUserId = row.ownerUserId ?? row.authorUserId;
    const owner = await ctx.db.get(ownerUserId);
    return {
      _id: row._id,
      slug: row.slug,
      categoryId: row.categoryId ?? null,
      categoryName: category ? category.name : (row.categoryName ?? null),
      categoryColor: category ? category.color : null,
      categoryDeleted: !row.categoryId && !!row.categoryName,
      thema: row.thema,
      erklaerung: row.erklaerung,
      tags: row.tags,
      link: row.link ?? null,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      version: row.version,
      pinned: row.pinned,
      authorName: row.authorName,
      authorUserId: row.authorUserId,
      ownerUserId,
      ownerName: displayName(owner),
      ownerAssigned: row.ownerUserId !== undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

const entryFields = {
  categoryId: v.optional(v.id("wikiCategories")),
  thema: v.string(),
  erklaerung: v.string(),
  tags: v.array(v.string()),
  link: v.optional(v.string()),
  validFrom: v.number(),
  validUntil: v.number(),
  ownerUserId: v.optional(v.id("users")),
};

/** Requires the manage_guidebooks capability — the frontend computes a
 * unique slug (checked against this table and the static registry, which
 * Convex doesn't know about) before calling this. */
export const create = mutation({
  args: { slug: v.string(), ...entryFields },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const existing = await ctx.db
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new ConvexError({ code: "conflict", message: "That slug is already taken" });
    }
    if (args.ownerUserId) {
      const owner = await ctx.db.get(args.ownerUserId);
      if (!owner || owner.status !== "active") {
        throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
      }
    }
    const now = Date.now();
    const id = await ctx.db.insert("wikiEntries", {
      ...args,
      version: 1,
      pinned: false,
      authorUserId: user._id,
      authorName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      ownerUserId: args.ownerUserId ?? user._id,
      createdAt: now,
      updatedAt: now,
    });
    return { id, slug: args.slug };
  },
});

export const update = mutation({
  args: { entryId: v.id("wikiEntries"), ...entryFields },
  handler: async (ctx, { entryId, ...patch }) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const entry = await ctx.db.get(entryId);
    if (!entry) throw new ConvexError({ code: "not_found", message: "Not found" });
    if (!isOwnerOrAdmin(user, entry.authorUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the author or an admin can edit this",
      });
    }
    if (patch.ownerUserId) {
      const owner = await ctx.db.get(patch.ownerUserId);
      if (!owner || owner.status !== "active") {
        throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
      }
    }
    // A save always re-selects a real category (or explicitly "none"), so
    // the deleted-category snapshot never survives an edit either way.
    await ctx.db.patch(entryId, {
      ...patch,
      categoryName: undefined,
      version: entry.version + 1,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Ownership is a narrow management action: a guidebook manager can hand the
 * upkeep responsibility to an active colleague without gaining permission to
 * rewrite that colleague's content. */
export const setOwner = mutation({
  args: { entryId: v.id("wikiEntries"), ownerUserId: v.id("users") },
  handler: async (ctx, { entryId, ownerUserId }) => {
    await requireCapability(ctx, "manage_guidebooks");
    const entry = await ctx.db.get(entryId);
    if (!entry) throw new ConvexError({ code: "not_found", message: "Entry not found" });
    const owner = await ctx.db.get(ownerUserId);
    if (!owner || owner.status !== "active") {
      throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
    }
    await ctx.db.patch(entryId, { ownerUserId, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { entryId: v.id("wikiEntries") },
  handler: async (ctx, { entryId }) => {
    const user = await requireCapability(ctx, "manage_guidebooks");
    const entry = await ctx.db.get(entryId);
    if (!entry) return { ok: false };
    if (!isOwnerOrAdmin(user, entry.authorUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the author or an admin can delete this",
      });
    }
    await ctx.db.delete(entryId);
    return { ok: true };
  },
});

/** Max 5 pinned entries at once, enforced here (not just client-side). */
export const togglePin = mutation({
  args: { entryId: v.id("wikiEntries") },
  handler: async (ctx, { entryId }) => {
    await requireCapability(ctx, "manage_guidebooks");
    const entry = await ctx.db.get(entryId);
    if (!entry) throw new ConvexError({ code: "not_found", message: "Not found" });
    if (!entry.pinned) {
      const pinnedCount = (await ctx.db.query("wikiEntries").collect()).filter(
        (e) => e.pinned,
      ).length;
      if (pinnedCount >= MAX_PINS) {
        throw new ConvexError({
          code: "limit",
          message: `At most ${MAX_PINS} entries can be pinned`,
        });
      }
    }
    await ctx.db.patch(entryId, { pinned: !entry.pinned });
    return { pinned: !entry.pinned };
  },
});
