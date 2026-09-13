import { Elysia, t } from "elysia";

import { requireServerKey } from "../../lib/middleware.js";
import { sendNotificationEmail } from "../../lib/resend.js";

/**
 * POST /internal/notifications — server-key gated. Convex internal actions call
 * this to send transactional email via Resend.
 */
export const internalNotificationsRoute = new Elysia().post(
  "/internal/notifications",
  async ({ request, body }) => {
    requireServerKey(request);
    await sendNotificationEmail(body.kind, body.to, body.data ?? {});
    return { sent: true };
  },
  {
    body: t.Object({
      kind: t.Union([
        t.Literal("invite"),
        t.Literal("access-approved"),
        t.Literal("access-denied"),
        t.Literal("absence-decision"),
        t.Literal("upload-decision"),
        t.Literal("chat-reinvite"),
        t.Literal("digest"),
        t.Literal("weekly-report"),
        t.Literal("academy-invite"),
        t.Literal("password-reset-request"),
        t.Literal("password-reset-link"),
        t.Literal("admin-verification-code"),
        t.Literal("security-alert"),
      ]),
      to: t.String(),
      data: t.Optional(t.Record(t.String(), t.Unknown())),
    }),
    response: { 200: t.Object({ sent: t.Boolean() }) },
  },
);
