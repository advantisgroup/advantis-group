import { Elysia, t } from "elysia";

import {
  listSecondaryEmails,
  removeSecondaryEmail,
  requestSecondaryEmailCode,
  verifySecondaryEmailCode,
} from "../lib/secondaryEmails.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireAuth, requireFirstPartyOrigin } from "../lib/middleware.js";

export const secondaryEmailsRoute = new Elysia()
  .get("/secondary-emails", async ({ request }) => {
    requireFirstPartyOrigin(request);
    const { clerkUserId } = await requireAuth(request);
    return { secondaryEmails: await listSecondaryEmails(clerkUserId) };
  })
  .post(
    "/secondary-emails/request-code",
    async ({ request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("secondary-email-request", clerkUserId, 5, "10 m");
      return await requestSecondaryEmailCode(clerkUserId, body.email);
    },
    { body: t.Object({ email: t.String() }) },
  )
  .post(
    "/secondary-emails/verify",
    async ({ request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("secondary-email-verify", clerkUserId, 20, "10 m");
      return await verifySecondaryEmailCode(clerkUserId, body.email, body.code);
    },
    { body: t.Object({ email: t.String(), code: t.String() }) },
  )
  .delete(
    "/secondary-emails/:id",
    async ({ request, params }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = await requireAuth(request);
      await removeSecondaryEmail(clerkUserId, params.id);
      return { ok: true };
    },
    { params: t.Object({ id: t.String() }) },
  );
