import { Elysia, t } from "elysia";

import { requireServerKey } from "../../lib/middleware.js";
import { sendWeeklyDigests } from "../../lib/resend.js";

const item = t.Object({ title: t.String(), path: t.String(), detail: t.Optional(t.String()) });

/**
 * POST /internal/digest/weekly — server-key gated. Convex's weekly digest
 * cron builds everyone's "what you missed" contents and hands them here,
 * because this API owns Resend.
 */
export const internalDigestRoute = new Elysia().post(
  "/internal/digest/weekly",
  async ({ request, body }) => {
    requireServerKey(request);
    console.info(`[internal/digest/weekly] recipients=${body.digests.length}`);
    return sendWeeklyDigests(body.digests);
  },
  {
    body: t.Object({
      digests: t.Array(
        t.Object({
          userId: t.String(),
          email: t.String(),
          firstName: t.Union([t.String(), t.Null()]),
          announcements: t.Array(item),
          updates: t.Array(item),
          wiki: t.Array(item),
          policies: t.Array(item),
          events: t.Array(item),
        }),
      ),
    }),
    response: { 200: t.Object({ failed: t.Number() }) },
  },
);
