import { Elysia, t } from "elysia";

import { requireServerKey } from "../../lib/middleware.js";
import { sendPush } from "../../lib/web-push.js";

/**
 * POST /internal/push/send — server-key gated. Convex's
 * notifications.push.send hands one notification and the person's browsers
 * here, because this API holds the VAPID keys.
 */
export const internalPushRoute = new Elysia().post(
  "/internal/push/send",
  async ({ request, body }) => {
    requireServerKey(request);
    return sendPush(body.subscriptions, body.notification);
  },
  {
    body: t.Object({
      notification: t.Object({
        id: t.String(),
        title: t.String(),
        body: t.Union([t.String(), t.Null()]),
        link: t.Union([t.String(), t.Null()]),
      }),
      subscriptions: t.Array(
        t.Object({ endpoint: t.String(), p256dh: t.String(), auth: t.String() }),
      ),
    }),
    response: { 200: t.Object({ sent: t.Number(), gone: t.Array(t.String()) }) },
  },
);
