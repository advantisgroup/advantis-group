import { Elysia, t } from "elysia";

import { createClerkInvitation } from "../../lib/clerk.js";
import { requireServerKey } from "../../lib/middleware.js";

/**
 * POST /internal/clerk/invitations — server-key gated. Convex's
 * `invites.create`/`resend` call this to have Clerk issue (and email) an
 * invitation. Clerk owns delivery; no Resend involved for invites. The invited
 * address is gated to sign up with that email, which also lets external domains
 * past any Clerk sign-up restriction.
 */
export const internalClerkInvitationsRoute = new Elysia().post(
  "/internal/clerk/invitations",
  async ({ request, body }) => {
    requireServerKey(request);
    const { invitationId } = await createClerkInvitation({
      email: body.email,
      role: body.role,
      invitedByName: body.invitedByName,
      redirectUrl: body.redirectUrl,
    });
    return { sent: true, invitationId };
  },
  {
    body: t.Object({
      email: t.String(),
      role: t.Union([
        t.Literal("admin"),
        t.Literal("manager"),
        t.Literal("employee"),
      ]),
      invitedByName: t.Optional(t.String()),
      redirectUrl: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({ sent: t.Boolean(), invitationId: t.String() }),
    },
  }
);
