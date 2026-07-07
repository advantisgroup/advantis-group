import { api } from "@advantis/convex/api";

import { getConvex, getConvexServerKey } from "./convex.js";

/**
 * Durable delivery record for every inbound Clockodo webhook hit, across both
 * `/webhooks/clockodo` and `/integrations/clockodo/webhook`. Vercel/Convex's
 * own function logs don't retain far enough back to catch an intermittent
 * failure that only recurs once a day — this survives regardless. Never let
 * a logging hiccup fail the webhook response itself.
 */
export function logClockodoWebhookDelivery(args: {
  endpoint: "webhooks/clockodo" | "integrations/clockodo/webhook";
  eventName?: string;
  ok: boolean;
  reason: string;
  token?: string | null;
  resourceId?: string;
}): void {
  getConvex()
    .mutation(api.clockodoWebhookLog.logWebhookDelivery, {
      serverKey: getConvexServerKey(),
      endpoint: args.endpoint,
      eventName: args.eventName,
      ok: args.ok,
      reason: args.reason,
      tokenPresent: !!args.token,
      tokenLength: args.token?.length,
      resourceId: args.resourceId,
    })
    .catch(err =>
      console.error(`[${args.endpoint}] failed to log webhook delivery:`, err)
    );
}
