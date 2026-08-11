import { v } from "convex/values";

import { internalAction } from "./_generated/server";

/**
 * Server-side PostHog capture. The browser bundle (`instrumentation-client.ts`)
 * covers what the user does in the UI; this covers what the backend decides —
 * cooldown rejections, admin approvals, magic links consumed — none of which
 * a client is trusted to report, and some of which happen with no browser
 * involved at all.
 *
 * Posts straight to the capture endpoint rather than pulling in `posthog-node`:
 * one `fetch` is the whole integration, and it runs in Convex's default
 * runtime with no `"use node"` action needed. Failures are logged and
 * swallowed — analytics must never break the flow it's measuring.
 *
 * Env (Convex deployment): `POSTHOG_KEY` (the project's `phc_…` key, same one
 * the browser uses) and optionally `POSTHOG_HOST` (defaults to the EU
 * ingestion host). Unset = silent no-op, so local dev needs no config.
 */
export const capture = internalAction({
  args: {
    event: v.string(),
    distinctId: v.optional(v.string()),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, { event, distinctId, properties }): Promise<{ sent: boolean }> => {
    const key = process.env.POSTHOG_KEY;
    if (!key) return { sent: false };
    const host = (process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(/\/+$/, "");

    try {
      const res = await fetch(`${host}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          event,
          distinct_id: distinctId ?? "convex-server",
          properties: {
            ...(properties ?? {}),
            $lib: "convex",
            // Anonymous backend events shouldn't mint person profiles.
            ...(distinctId ? {} : { $process_person_profile: false }),
          },
          timestamp: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        console.error(`[analytics] capture ${event} failed: ${res.status}`);
        return { sent: false };
      }
      return { sent: true };
    } catch (error) {
      console.error(`[analytics] capture ${event} error:`, error);
      return { sent: false };
    }
  },
});
