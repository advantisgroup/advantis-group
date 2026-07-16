import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, query } from "../_generated/server";
import { requireUser } from "../lib/auth";

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
export const getLatestAgentVersion = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", q => q.eq("key", LATEST_VERSION_KEY))
      .unique();
    return row?.value ?? null;
  },
});

export const storeLatestAgentVersion = internalMutation({
  args: { version: v.string() },
  handler: async (ctx, { version }) => {
    const existing = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", q => q.eq("key", LATEST_VERSION_KEY))
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

/** Public GitHub releases API — the repo is public, no auth needed. */
export const refreshLatestAgentVersion = internalAction({
  args: {},
  handler: async ctx => {
    let tagName: string | undefined;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        { headers: { Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { tag_name?: string };
      tagName = data.tag_name;
    } catch (err) {
      console.error("[activity/agentVersion] GitHub fetch failed:", err);
      return;
    }
    if (!tagName) return;
    await ctx.runMutation(
      internal.activity.agentVersion.storeLatestAgentVersion,
      { version: tagName.replace(/^v/, "") }
    );
  },
});
