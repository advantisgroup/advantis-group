import { Elysia } from "elysia";

import { invalidateAll } from "../../lib/onedrive/cache.js";

/**
 * Microsoft Graph change-notification receiver. Two jobs:
 *  1. Subscription handshake — Graph POSTs `?validationToken=…` and expects it
 *     echoed back as text/plain within 10s.
 *  2. Change notifications — any verified notification means something in the
 *     drive moved, so we drop the listing cache. Individual notification errors
 *     are swallowed (logged) so one bad item never fails the whole batch, and we
 *     always answer 202 fast so Graph doesn't retry/disable the subscription.
 */
export const onedriveWebhookRoute = new Elysia().post(
  "/webhooks/onedrive",
  async ({ query, body, set }) => {
    // 1. Validation handshake.
    const validationToken = (query as { validationToken?: string }).validationToken;
    if (validationToken) {
      return new Response(validationToken, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    // 2. Change notifications.
    const expected = process.env.ONEDRIVE_WEBHOOK_SECRET;
    const notifications = (body as { value?: { clientState?: string }[] } | null)?.value ?? [];
    let anyValid = false;
    for (const note of notifications) {
      try {
        if (!expected || note.clientState === expected) {
          anyValid = true;
        } else {
          console.warn("[onedrive] webhook with bad clientState ignored");
        }
      } catch (error) {
        console.error("[onedrive] webhook notification error:", error);
      }
    }
    if (anyValid) await invalidateAll();

    set.status = 202;
    return { ok: true };
  },
);
