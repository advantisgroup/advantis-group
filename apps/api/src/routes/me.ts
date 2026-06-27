import { Elysia, t } from "elysia";

import { requireAuth } from "../lib/middleware.js";

/** GET /me — the authenticated intranet identity (verified Clerk session). */
export const meRoute = new Elysia().get(
  "/me",
  async ({ request }) => {
    const { clerkUserId, sessionId } = await requireAuth(request);
    return { clerkUserId, sessionId };
  },
  {
    response: {
      200: t.Object({
        clerkUserId: t.String(),
        sessionId: t.Union([t.String(), t.Null()]),
      }),
    },
  }
);
