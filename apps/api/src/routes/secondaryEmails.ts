import { Elysia, t } from "elysia";

import {
  listSecondaryEmails,
  removeSecondaryEmail,
  requestSecondaryEmailCode,
  verifySecondaryEmailCode,
} from "../lib/secondaryEmails.js";
import { Errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { destructiveStepUpHint } from "../lib/stepUp.js";
import { requireFirstPartyOrigin, authed } from "../lib/middleware.js";

export const secondaryEmailsRoute = new Elysia()
  .use(authed)
  .get(
    "/secondary-emails",
    async ({ caller, request }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = caller;
      return { secondaryEmails: await listSecondaryEmails(clerkUserId) };
    },
    { signedIn: true },
  )
  .post(
    "/secondary-emails/request-code",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("secondary-email-request", clerkUserId, 5, "10 m");
      // A verified secondary address can receive password resets for linked
      // areas, so adding one costs the same fresh check as removing a factor.
      const hint = await destructiveStepUpHint(clerkUserId, sessionId);
      if (hint) return hint;
      return await requestSecondaryEmailCode(clerkUserId, body.email);
    },
    {
      signedIn: true,
      body: t.Object({ email: t.String() }),
    },
  )
  .post(
    "/secondary-emails/verify",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = caller;
      await rateLimit("secondary-email-verify", clerkUserId, 20, "10 m");
      return await verifySecondaryEmailCode(clerkUserId, body.email, body.code);
    },
    {
      signedIn: true,
      body: t.Object({ email: t.String(), code: t.String() }),
    },
  )
  .delete(
    "/secondary-emails/:id",
    async ({ caller, request, params }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = caller;
      await removeSecondaryEmail(clerkUserId, params.id);
      return { ok: true };
    },
    {
      signedIn: true,
      params: t.Object({ id: t.String() }),
    },
  );
