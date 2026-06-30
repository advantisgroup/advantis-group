import { Elysia } from "elysia";

import { requireEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";
import { requireServerKey } from "../../lib/middleware.js";
import { createSubscription } from "../../lib/onedrive/graph.js";

/**
 * POST /internal/onedrive/subscribe — server-key gated. Convex's daily cron
 * calls this to (re)create the Graph change-notification subscription that keeps
 * the listing cache fresh. Recreating well within the expiry window is simpler
 * and more robust than tracking + renewing a stored subscription id.
 */
export const internalOnedriveRoute = new Elysia().post(
  "/internal/onedrive/subscribe",
  async ({ request }) => {
    requireServerKey(request);
    const notificationUrl = requireEnv("ONEDRIVE_WEBHOOK_URL");
    const clientState = requireEnv("ONEDRIVE_WEBHOOK_SECRET");
    // Graph drive subscriptions live at most ~30 days; renew daily from cron.
    const expiry = new Date(Date.now() + 6 * 86_400_000).toISOString();
    try {
      const sub = await createSubscription(
        notificationUrl,
        clientState,
        expiry
      );
      return { ok: true, subscriptionId: sub.id, expiresAt: sub.expirationDateTime };
    } catch (error) {
      console.error("[onedrive] subscription create failed:", error);
      throw Errors.upstream("Could not create OneDrive subscription");
    }
  }
);
