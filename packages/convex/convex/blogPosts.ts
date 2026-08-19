import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import { requireCapability } from "./lib/auth";

const languageValidator = v.union(v.literal("de"), v.literal("en"));

/** Everything (incl. drafts) — the intranet blog list page manages
 * filtering/sorting itself. Mirrors wikiEntries.list. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, "manage_blog");
    return ctx.db.query("blogPosts").order("desc").collect();
  },
});

export const get = query({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    await requireCapability(ctx, "manage_blog");
    return ctx.db.get(postId);
  },
});

const postFields = {
  slug: v.string(),
  language: languageValidator,
  translationKey: v.optional(v.string()),
  title: v.string(),
  excerpt: v.string(),
  body: v.string(),
  mainImageStorageId: v.optional(v.id("_storage")),
};

async function assertSlugAvailable(
  ctx: Parameters<typeof requireCapability>[0],
  slug: string,
  language: "de" | "en",
  ignorePostId?: string,
) {
  const existing = await ctx.db
    .query("blogPosts")
    .withIndex("by_slug_language", (q) => q.eq("slug", slug).eq("language", language))
    .unique();
  if (existing && existing._id !== ignorePostId) {
    throw new ConvexError({ code: "conflict", message: "That slug is already taken" });
  }
}

export const create = mutation({
  args: postFields,
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "manage_blog");
    await assertSlugAvailable(ctx, args.slug, args.language);
    const now = Date.now();
    const id = await ctx.db.insert("blogPosts", {
      ...args,
      authorUserId: user._id,
      authorName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { id, slug: args.slug };
  },
});

export const update = mutation({
  args: { postId: v.id("blogPosts"), ...postFields },
  handler: async (ctx, { postId, ...patch }) => {
    await requireCapability(ctx, "manage_blog");
    const post = await ctx.db.get(postId);
    if (!post) throw new ConvexError({ code: "not_found", message: "Not found" });
    await assertSlugAvailable(ctx, patch.slug, patch.language, postId);
    await ctx.db.patch(postId, {
      ...patch,
      version: post.version + 1,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Resolves mainImageUrl from mainImageStorageId (if set) so an
 * unauthenticated marketing-site read never needs the auth-gated
 * files.getUrl — Convex storage URLs are publicly fetchable once obtained. */
export const publish = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    await requireCapability(ctx, "manage_blog");
    const post = await ctx.db.get(postId);
    if (!post) throw new ConvexError({ code: "not_found", message: "Not found" });
    const mainImageUrl = post.mainImageStorageId
      ? await ctx.storage.getUrl(post.mainImageStorageId)
      : undefined;
    await ctx.db.patch(postId, {
      status: "published",
      publishedAt: post.publishedAt ?? Date.now(),
      mainImageUrl: mainImageUrl ?? undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const unpublish = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    await requireCapability(ctx, "manage_blog");
    const post = await ctx.db.get(postId);
    if (!post) throw new ConvexError({ code: "not_found", message: "Not found" });
    await ctx.db.patch(postId, { status: "draft", updatedAt: Date.now() });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { postId: v.id("blogPosts") },
  handler: async (ctx, { postId }) => {
    await requireCapability(ctx, "manage_blog");
    const post = await ctx.db.get(postId);
    if (!post) return { ok: false };
    if (post.mainImageStorageId) {
      await ctx.storage.delete(post.mainImageStorageId);
    }
    await ctx.db.delete(postId);
    return { ok: true };
  },
});

const PUBLIC_FIELDS = (post: {
  _id: string;
  title: string;
  slug: string;
  language: "de" | "en";
  excerpt: string;
  body: string;
  mainImageUrl?: string;
  authorName: string;
  publishedAt?: number;
}) => ({
  _id: post._id,
  title: post.title,
  slug: post.slug,
  language: post.language,
  excerpt: post.excerpt,
  body: post.body,
  mainImageUrl: post.mainImageUrl ?? null,
  author: post.authorName,
  publishedAt: post.publishedAt ?? 0,
});

/** Public — no auth guard. Called from apps/marketing via a plain
 * ConvexHttpClient (see packages/convex/convex/emails.ts for the same
 * no-guard-query convention). */
export const getAll = query({
  args: { language: languageValidator },
  handler: async (ctx, { language }) => {
    const rows = await ctx.db
      .query("blogPosts")
      .withIndex("by_language_status_publishedAt", (q) =>
        q.eq("language", language).eq("status", "published"),
      )
      .order("desc")
      .collect();
    return rows.map(PUBLIC_FIELDS);
  },
});

export const getBySlug = query({
  args: { language: languageValidator, slug: v.string() },
  handler: async (ctx, { language, slug }) => {
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug_language", (q) => q.eq("slug", slug).eq("language", language))
      .unique();
    if (!post || post.status !== "published") return null;
    return PUBLIC_FIELDS(post);
  },
});
