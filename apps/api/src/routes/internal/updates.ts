import { Elysia, t } from "elysia";

import { requireServerKey } from "../../lib/middleware.js";
import { sendUpdateBroadcast } from "../../lib/resend.js";

/**
 * POST /internal/updates/broadcast — server-key gated. Convex's
 * updatesEmail.sendBulk action calls this once per published update to
 * batch-send the company-wide email via Resend, tagging each message with
 * update_id/user_id so the /webhooks/resend handler can correlate
 * delivery/open/click events back to the right recipient row.
 */
export const internalUpdatesRoute = new Elysia().post(
  "/internal/updates/broadcast",
  async ({ request, body }) => {
    requireServerKey(request);
    console.log(
      `[internal/updates/broadcast] updateId=${body.updateId} type=${body.type} recipients=${body.recipients.length}`
    );
    try {
      const results = await sendUpdateBroadcast(
        { type: body.type, title: body.title, summary: body.summary, url: body.url },
        body.updateId,
        body.recipients
      );
      return { results };
    } catch (error) {
      console.error(
        `[internal/updates/broadcast] failed for updateId=${body.updateId}:`,
        error
      );
      throw error;
    }
  },
  {
    body: t.Object({
      updateId: t.String(),
      type: t.Union([
        t.Literal("incident"),
        t.Literal("maintenance"),
        t.Literal("changelog"),
      ]),
      title: t.String(),
      summary: t.String(),
      url: t.String(),
      recipients: t.Array(
        t.Object({ userId: t.String(), email: t.String() })
      ),
    }),
    response: {
      200: t.Object({
        results: t.Array(
          t.Object({
            userId: t.String(),
            email: t.String(),
            resendEmailId: t.Optional(t.String()),
            failed: t.Optional(t.Boolean()),
          })
        ),
      }),
    },
  }
);
