import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, userQuery } from "../functions";
/**
 * Latest published ActivityTrack desktop-agent version, mirrored from GitHub
 * releases so the overview can flag devices running an older build.
 * Refreshed hourly by a cron (see crons.ts) — nobody's dashboard load should
 * ever wait on a GitHub round trip, and a transient GitHub outage just means
 * a stale (not missing) comparison value.
 */
const LATEST_VERSION_KEY = "meta.latestAgentVersion";
const REPO = "Bluejutzu/ActivityTrack";

/** Reactive read for the dashboard. `null` until the first cron run lands. */
export const getLatestAgentVersion = userQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", LATEST_VERSION_KEY))
      .unique();
    return row?.value ?? null;
  },
});

export const storeLatestAgentVersion = internalMutation({
  args: { version: v.string() },
  handler: async (ctx, { version }) => {
    const existing = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", LATEST_VERSION_KEY))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: version,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("activitySettings", {
        key: LATEST_VERSION_KEY,
        value: version,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Public GitHub releases API — the repo is public, but unauthenticated
 * requests share GitHub's 60/hour-per-source-IP limit with every other
 * tenant on Convex's outbound IPs, so this can 403 as "rate limited" even
 * though this action alone only calls it once an hour. Setting
 * `ACTIVITYTRACK_GITHUB_TOKEN` (any valid PAT, no scopes needed for public
 * read access) switches to the authenticated 5000/hour limit, which is
 * tied to the token instead of the shared IP.
 */
export const refreshLatestAgentVersion = internalAction({
  args: {},
  handler: async (ctx) => {
    let tagName: string | undefined;
    try {
      const token = process.env.ACTIVITYTRACK_GITHUB_TOKEN;
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: {
          Accept: "application/vnd.github+json",
          // GitHub's API 403s any request with no User-Agent, public repo
          // or not — it doesn't default one for us the way a browser would.
          "User-Agent": "advantis-group-activitytrack-version-check",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[activity/agentVersion] GitHub responded ${res.status} ${res.statusText}`, {
          authenticated: !!token,
          rateLimitRemaining: res.headers.get("x-ratelimit-remaining"),
          rateLimitReset: res.headers.get("x-ratelimit-reset"),
          body: body.slice(0, 500),
        });
        return;
      }
      const data = (await res.json()) as { tag_name?: string };
      tagName = data.tag_name;
    } catch (err) {
      console.error("[activity/agentVersion] GitHub fetch failed:", err);
      return;
    }
    if (!tagName) {
      console.error("[activity/agentVersion] GitHub release response had no tag_name");
      return;
    }
    const version = tagName.replace(/^v/, "");
    console.info(`[activity/agentVersion] latest version is now ${version}`);
    await ctx.runMutation(internal.activity.agentVersion.storeLatestAgentVersion, { version });
  },
});
