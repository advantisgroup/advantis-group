import { Elysia, t } from "elysia";

import { authed } from "../lib/middleware.js";

/** GET /me — the authenticated intranet identity (verified Clerk session). */
export const meRoute = new Elysia().use(authed).get(
  "/me",
  async ({ caller }) => {
    const { clerkUserId, sessionId } = caller;
    return { clerkUserId, sessionId };
  },
  {
    signedIn: true,
    response: {
      200: t.Object({
        clerkUserId: t.String(),
        sessionId: t.Union([t.String(), t.Null()]),
      }),
    },
  },
);
