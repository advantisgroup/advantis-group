import { v } from "convex/values";

import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { sandboxedMutation } from "./lib/sandbox";

/**
 * First-party marketing-site analytics, replacing PostHog. Two writes from
 * the browser (`recordPageview`, `recordEvent`) plus one internal query
 * (`computeForPost`, called by `blogAnalytics.getForPost`) that does the
 * same job PostHog's Query API used to: views, unique visitors, average time
 * on page, bounce rate and referrers for one blog post.
 *
 * No cookies, no persistent id — `sessionId` lives in the browser's
 * `sessionStorage` (see `AnalyticsTracker.tsx`), which dies with the tab.
 * That's also why there's nothing here for a consent banner to gate.
 */

const MAX_STRING_LEN = 256;
const BLOG_PATH = /^\/(de|en)\/blog\/([^/]+)$/;

/** `/{language}/blog/{slug}` uses the exact same `by_slug_language` index the
 * router itself resolves posts through — so this can't drift out of sync
 * with routing the way a second, independently-maintained mapping could. A
 * page that isn't a blog post (or a slug the router 404s on) just leaves
 * `postId` unset; the row still exists for path-level use later. */
async function resolvePostId(ctx: MutationCtx, path: string) {
  const match = BLOG_PATH.exec(path);
  if (!match) return undefined;
  const [, language, slug] = match;
  const post = await ctx.db
    .query("blogPosts")
    .withIndex("by_slug_language", (q) => q.eq("slug", slug).eq("language", language as "de" | "en"))
    .unique();
  return post?._id;
}

export const recordPageview = sandboxedMutation({
  args: {
    path: v.string(),
    locale: v.string(),
    sessionId: v.string(),
    referrerDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Drop malformed/oversized payloads rather than throw — a visitor should
    // never see an error because analytics didn't like their request.
    if (
      args.path.length > MAX_STRING_LEN ||
      args.sessionId.length > 128 ||
      (args.referrerDomain?.length ?? 0) > MAX_STRING_LEN
    ) {
      return null;
    }

    return ctx.db.insert("analyticsPageviews", {
      path: args.path,
      postId: await resolvePostId(ctx, args.path),
      locale: args.locale,
      sessionId: args.sessionId,
      referrerDomain: args.referrerDomain,
      createdAt: Date.now(),
    });
  },
});

export const recordEvent = sandboxedMutation({
  args: { name: v.string(), sessionId: v.string(), locale: v.string() },
  handler: async (ctx, args) => {
    if (args.name.length > 128 || args.sessionId.length > 128) return;
    await ctx.db.insert("analyticsEvents", { ...args, createdAt: Date.now() });
  },
});

/** Fills in `durationMs` after the fact — called from the `/analytics/duration`
 * HTTP route, which is what a `sendBeacon` on `pagehide` can actually reach
 * (a WebSocket mutation call isn't guaranteed to flush before the tab closes). */
export const applyDuration = internalMutation({
  args: { pageviewId: v.id("analyticsPageviews"), durationMs: v.number() },
  handler: async (ctx, { pageviewId, durationMs }) => {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > SIX_HOURS_MS) return;
    await ctx.db.patch(pageviewId, { durationMs });
  },
});

interface ReferrerRow {
  domain: string;
  visitors: number;
}

interface PostAnalytics {
  views: number;
  uniqueVisitors: number;
  avgTimeOnPageSeconds: number | null;
  bounceRate: number | null;
  referrers: ReferrerRow[];
}

const EMPTY: PostAnalytics = {
  views: 0,
  uniqueVisitors: 0,
  avgTimeOnPageSeconds: null,
  bounceRate: null,
  referrers: [],
};

/**
 * A "bounce" is a session whose entire pageview history in range is this one
 * hit — same definition PostHog and every other web analytics tool uses.
 * Requires one extra indexed read per distinct session that touched this
 * post; fine at this site's traffic, would want batching if the blog ever
 * gets genuinely popular.
 */
export const computeForPost = internalQuery({
  args: { postId: v.id("blogPosts"), days: v.number() },
  handler: async (ctx, { postId, days }): Promise<PostAnalytics> => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const rows = await ctx.db
      .query("analyticsPageviews")
      .withIndex("by_postId_createdAt", (q) => q.eq("postId", postId).gte("createdAt", since))
      .collect();

    if (rows.length === 0) return EMPTY;

    const sessionIds = [...new Set(rows.map((r) => r.sessionId))];

    const durations = rows.map((r) => r.durationMs).filter((d): d is number => d != null);
    const avgTimeOnPageSeconds =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length / 1000
        : null;

    let bounced = 0;
    for (const sessionId of sessionIds) {
      const sessionRows = await ctx.db
        .query("analyticsPageviews")
        .withIndex("by_sessionId_createdAt", (q) =>
          q.eq("sessionId", sessionId).gte("createdAt", since),
        )
        .collect();
      if (sessionRows.length === 1) bounced++;
    }

    const referrerSessions = new Map<string, Set<string>>();
    for (const row of rows) {
      const domain = row.referrerDomain || "direct";
      const set = referrerSessions.get(domain) ?? new Set<string>();
      set.add(row.sessionId);
      referrerSessions.set(domain, set);
    }
    const referrers = [...referrerSessions.entries()]
      .map(([domain, sessions]) => ({ domain, visitors: sessions.size }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 8);

    return {
      views: rows.length,
      uniqueVisitors: sessionIds.length,
      avgTimeOnPageSeconds,
      bounceRate: bounced / sessionIds.length,
      referrers,
    };
  },
});
