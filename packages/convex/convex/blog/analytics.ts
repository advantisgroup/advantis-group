import { v } from "convex/values";

import { api, internal } from "../_generated/api";
import { requireCapabilityForAction } from "../lib/auth";
import { action } from "../functions";

/**
 * Per-post analytics for the blog manage page. Was a PostHog Query API call
 * (see git history) — now reads `analyticsPageviews`, which the marketing
 * site's own `AnalyticsTracker` writes to directly, keyed by `postId` rather
 * than a re-derived URL path. Kept as an action (not a query) so
 * `useBlogPostAnalytics.ts`'s `useAction` call and this function's shape
 * didn't need to change at all — only what happens inside it did.
 */

interface ReferrerRow {
  domain: string;
  visitors: number;
}

interface BlogAnalyticsResult {
  configured: boolean;
  published: boolean;
  path: string;
  publicUrl: string;
  views: number;
  uniqueVisitors: number;
  avgTimeOnPageSeconds: number | null;
  bounceRate: number | null;
  referrers: ReferrerRow[];
}

const SITE_ORIGIN = "https://advantisgroup.de";

export const getForPost = action({
  args: { postId: v.id("blogPosts"), days: v.optional(v.number()) },
  handler: async (ctx, { postId, days }): Promise<BlogAnalyticsResult> => {
    await requireCapabilityForAction(ctx, "manage_blog");

    const post = await ctx.runQuery(api.blog.posts.get, { postId });
    if (!post) throw new Error("Post not found");

    const path = `/${post.language}/blog/${post.slug}`;
    const base = {
      configured: true,
      published: post.status === "published",
      path,
      publicUrl: `${SITE_ORIGIN}${path}`,
    };

    if (post.status !== "published") {
      return {
        ...base,
        views: 0,
        uniqueVisitors: 0,
        avgTimeOnPageSeconds: null,
        bounceRate: null,
        referrers: [],
      };
    }

    const stats = await ctx.runQuery(internal.marketing.analytics.computeForPost, {
      postId,
      days: days ?? 30,
    });

    return { ...base, ...stats };
  },
});
