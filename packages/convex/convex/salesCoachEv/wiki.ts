import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { assertServerKey, requireAdminCaller } from "./lib";

/**
 * Server-key gated CRUD for the Sales Coach EV knowledge base. Reads are
 * open to any authenticated intranet user (apps/api's requireAuth already
 * gates the request before it gets here); writes require the caller to be
 * an intranet admin, checked via `requireAdminCaller`.
 */

const catValidator = v.union(
  v.literal("Produktdaten"),
  v.literal("Preisliste"),
  v.literal("Technik"),
  v.literal("Argumente"),
  v.literal("Rechtliches"),
  v.literal("Intern"),
  v.literal("Links"),
);

export const list = query({
  args: { serverKey: v.string() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const articles = await ctx.db.query("salesCoachEvWiki").collect();
    return articles.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const create = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    title: v.string(),
    cat: catValidator,
    tags: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    isLink: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    await requireAdminCaller(ctx, args.clerkUserId);
    const now = Date.now();
    const id = await ctx.db.insert("salesCoachEvWiki", {
      title: args.title,
      cat: args.cat,
      tags: args.tags,
      body: args.body,
      url: args.url,
      isLink: args.isLink,
      authorClerkUserId: args.clerkUserId,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const update = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    id: v.id("salesCoachEvWiki"),
    title: v.optional(v.string()),
    cat: v.optional(catValidator),
    tags: v.optional(v.string()),
    body: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    await requireAdminCaller(ctx, args.clerkUserId);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError({ code: "not_found", message: "Article not found" });
    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.cat !== undefined ? { cat: args.cat } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.body !== undefined ? { body: args.body } : {}),
      ...(args.url !== undefined ? { url: args.url } : {}),
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

export const remove = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string(), id: v.id("salesCoachEvWiki") },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    await requireAdminCaller(ctx, args.clerkUserId);
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});
