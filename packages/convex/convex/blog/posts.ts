import { internalMutation, mutation, query } from "../functions";
import { ConvexError, v } from "convex/values";

import { requireCapability } from "../lib/auth";
import { ensureShareCode } from "./lib/sharing";

const languageValidator = v.union(v.literal("de"), v.literal("en"));

// Keeps excerpts skimmable on the list page and usable as a lede — a
// paragraph-length excerpt defeats the point of both.
const EXCERPT_MAX_LENGTH = 200;

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
  category: v.optional(v.string()),
  body: v.string(),
  mainImageStorageId: v.optional(v.id("_storage")),
};

const WORDS_PER_MINUTE = 200;

/** Rough read-time estimate from the stored HTML body. Tags are stripped
 * rather than parsed — an approximate word count is all a "5 min read" label
 * needs, and this runs in a mutation, not a render. */
function estimateReadingMinutes(html: string): number {
  const words = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function assertExcerptLength(excerpt: string) {
  if (excerpt.length > EXCERPT_MAX_LENGTH) {
    throw new ConvexError({
      code: "invalid_argument",
      message: `Excerpt must be ${EXCERPT_MAX_LENGTH} characters or fewer`,
    });
  }
}

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
    assertExcerptLength(args.excerpt);
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
    assertExcerptLength(patch.excerpt);
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
    const author = await ctx.db.get(post.authorUserId);
    const authorAvatarUrl = author?.avatarStorageId
      ? await ctx.storage.getUrl(author.avatarStorageId)
      : undefined;
    await ctx.db.patch(postId, {
      status: "published",
      publishedAt: post.publishedAt ?? Date.now(),
      mainImageUrl: mainImageUrl ?? undefined,
      authorAvatarUrl: authorAvatarUrl ?? undefined,
      readingMinutes: estimateReadingMinutes(post.body),
      updatedAt: Date.now(),
    });
    // A published post is a shareable post, so the short link exists from the
    // moment there's something to share. No-ops if it already has one.
    await ensureShareCode(ctx, postId);
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

interface PublicPostRow {
  _id: string;
  title: string;
  slug: string;
  language: "de" | "en";
  excerpt: string;
  category?: string;
  body: string;
  mainImageUrl?: string;
  authorName: string;
  authorAvatarUrl?: string;
  readingMinutes?: number;
  publishedAt?: number;
  shareCode?: string;
}

/** Everything the list page needs — deliberately without `body`, which would
 * otherwise ship every post's full HTML to render a grid of excerpts. */
const PUBLIC_SUMMARY = (post: PublicPostRow) => ({
  _id: post._id,
  title: post.title,
  slug: post.slug,
  language: post.language,
  excerpt: post.excerpt,
  category: post.category ?? null,
  mainImageUrl: post.mainImageUrl ?? null,
  author: post.authorName,
  authorAvatarUrl: post.authorAvatarUrl ?? null,
  readingMinutes: post.readingMinutes ?? null,
  publishedAt: post.publishedAt ?? 0,
  shareCode: post.shareCode ?? null,
});

const PUBLIC_DETAIL = (post: PublicPostRow) => ({
  ...PUBLIC_SUMMARY(post),
  body: post.body,
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
    return rows.map(PUBLIC_SUMMARY);
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
    return PUBLIC_DETAIL(post);
  },
});

/** One-off for posts published before share codes existed. Safe to re-run —
 * `ensureShareCode` leaves posts that already have one alone. */
export const backfillShareCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db
      .query("blogPosts")
      .filter((q) => q.eq(q.field("shareCode"), undefined))
      .collect();
    for (const post of posts) {
      await ensureShareCode(ctx, post._id);
    }
    return { filled: posts.length };
  },
});
