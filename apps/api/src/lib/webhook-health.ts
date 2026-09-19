import { api } from "@advantis/convex/api";

import { getConvex, getConvexServerKey } from "./convex.js";

type WebhookSource = "clerk" | "resend" | "onedrive";

/**
 * Run a webhook's work and tell the admin Systems panel how it went. A
 * failure to record never changes the webhook's own answer.
 */
export async function withWebhookHealth<T>(source: WebhookSource, work: () => Promise<T>) {
  try {
    const result = await work();
    await record(source, true);
    return result;
  } catch (error) {
    await record(source, false, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function record(source: WebhookSource, ok: boolean, message?: string) {
  try {
    await getConvex().mutation(api.integrations.health.apiRecordWebhook, {
      serverKey: getConvexServerKey(),
      source,
      ok,
      message,
    });
  } catch (error) {
    console.error(`[webhook-health] could not record ${source}:`, error);
  }
}
