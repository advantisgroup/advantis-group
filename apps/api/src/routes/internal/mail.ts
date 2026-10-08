import { Elysia, t } from "elysia";

import { assertMailAvailable, pollAccount } from "../../lib/mail.js";
import { requireServerKey } from "../../lib/middleware.js";

/** IONOS caps parallel logins per customer; a handful at a time stays clear. */
const CONCURRENCY = 4;

/**
 * POST /internal/mail/poll — server-key gated. Convex's mail cron hands over
 * every mailbox it wants checked (password still encrypted); this answers
 * where each inbox stands and which new mail arrived since the last check.
 */
export const internalMailRoute = new Elysia().post(
  "/internal/mail/poll",
  async ({ request, body }) => {
    requireServerKey(request);
    assertMailAvailable();
    const queue = [...body.accounts];
    const results: Awaited<ReturnType<typeof pollAccount>>[] = [];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          results.push(await pollAccount(next));
        }
      }),
    );
    return { results };
  },
  {
    body: t.Object({
      accounts: t.Array(
        t.Object({
          id: t.String(),
          email: t.String(),
          passwordEnc: t.String(),
          updatedAt: t.Number(),
          uidValidity: t.Union([t.String(), t.Null()]),
          uidNext: t.Union([t.Number(), t.Null()]),
        }),
      ),
    }),
  },
);
