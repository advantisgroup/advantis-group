import { v } from "convex/values";

import { api } from "./_generated/api";
import { requireBlogManageAction } from "./integrations/lib/auth";
import { sandboxedAction as action } from "./lib/sandbox";

/**
 * Reads (not writes) PostHog analytics for one blog post, scoped to its
 * canonical public path rather than a custom event/property - the
 * marketing site's $pageview autocapture already carries $pathname, so
 * this works retroactively for posts published before this feature
 * existed, with zero new client-side instrumentation.
 *
 * Distinct credential from analytics.ts's POSTHOG_KEY: that one is a
 * write-only project key for sending events, this needs a Personal API
 * Key with query scope to read them back out via PostHog's Query API.
 *
 * Env (Convex deployment, set with `npx convex env set NAME value` from
 * packages/convex): `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID`
 * (both required), `POSTHOG_API_HOST` (optional, defaults to the EU app
 * host). Unset = `{ configured: false }`, no error.
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
const DEFAULT_POSTHOG_API_HOST = "https://eu.posthog.com";

async function runPostHogQuery(
  host: string,
  projectId: string,
  apiKey: string,
  query: Record<string, unknown>,
): Promise<{ results?: unknown[] }> {
  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`PostHog query failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** WebOverviewQuery returns `{ key, value, kind }` rows - "visitors",
 * "views", "sessions", "session duration" (seconds), "bounce rate"
 * (fraction). Verified directly against the live PostHog project this
 * repo is wired to. */
function readOverviewMetric(results: unknown[] | undefined, key: string): number | null {
  const row = results?.find(
    (r): r is { key: string; value: number | null } =>
      typeof r === "object" && r !== null && "key" in r && (r as { key: unknown }).key === key,
  );
  return row?.value ?? null;
}

/** WebStatsTableQuery rows are `[breakdownValue, visitorsCount, ...]` -
 * defensively unwraps a `[value, previous]` comparison tuple too, in case
 * PostHog's table format includes one even with compareFilter off. */
function readTableCount(cell: unknown): number {
  if (Array.isArray(cell)) return Number(cell[0] ?? 0) || 0;
  return Number(cell ?? 0) || 0;
}

export const getForPost = action({
  args: { postId: v.id("blogPosts"), days: v.optional(v.number()) },
  handler: async (ctx, { postId, days }): Promise<BlogAnalyticsResult> => {
    await requireBlogManageAction(ctx);

    const post = await ctx.runQuery(api.blogPosts.get, { postId });
    if (!post) throw new Error("Post not found");

    const path = `/${post.language}/blog/${post.slug}`;
    const empty: BlogAnalyticsResult = {
      configured: false,
      published: post.status === "published",
      path,
      publicUrl: `${SITE_ORIGIN}${path}`,
      views: 0,
      uniqueVisitors: 0,
      avgTimeOnPageSeconds: null,
      bounceRate: null,
      referrers: [],
    };

    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID;
    if (!apiKey || !projectId) return empty;
    if (post.status !== "published") return { ...empty, configured: true };

    const host = (process.env.POSTHOG_API_HOST ?? DEFAULT_POSTHOG_API_HOST).replace(/\/+$/, "");
    const dateRange = { date_from: `-${days ?? 30}d` };
    const pathFilter = [{ key: "$pathname", operator: "exact", value: path, type: "event" }];

    try {
      const [overview, referrersTable] = await Promise.all([
        runPostHogQuery(host, projectId, apiKey, {
          kind: "WebOverviewQuery",
          dateRange,
          properties: pathFilter,
        }),
        runPostHogQuery(host, projectId, apiKey, {
          kind: "WebStatsTableQuery",
          breakdownBy: "InitialReferringDomain",
          dateRange,
          properties: pathFilter,
          limit: 8,
        }),
      ]);

      const referrers: ReferrerRow[] = (referrersTable.results ?? [])
        .map((row) => {
          const cells = row as unknown[];
          return {
            domain: String(cells[0] ?? "direct") || "direct",
            visitors: readTableCount(cells[1]),
          };
        })
        .filter((r) => r.visitors > 0);

      return {
        ...empty,
        configured: true,
        views: readOverviewMetric(overview.results, "views") ?? 0,
        uniqueVisitors: readOverviewMetric(overview.results, "visitors") ?? 0,
        avgTimeOnPageSeconds: readOverviewMetric(overview.results, "session duration"),
        bounceRate: readOverviewMetric(overview.results, "bounce rate"),
        referrers,
      };
    } catch (error) {
      console.error("[blogAnalytics] getForPost failed:", error);
      return { ...empty, configured: true };
    }
  },
});
