import { Elysia, t } from "elysia";

import { beginEnrollment, finishEnrollment, getStatus, removeMfa } from "../lib/totp.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireAuth } from "../lib/middleware.js";

export const totpRoute = new Elysia()
  .get("/mfa/totp/status", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    return await getStatus(clerkUserId);
  })
  .post("/mfa/totp/enroll", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    await rateLimit("totp-enroll", clerkUserId, 10, "1 h");
    return await beginEnrollment(clerkUserId);
  })
  .post(
    "/mfa/totp/enroll/verify",
    async ({ request, body }) => {
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("totp-enroll", clerkUserId, 10, "1 h");
      return await finishEnrollment(clerkUserId, body.code);
    },
    { body: t.Object({ code: t.String() }) },
  )
  .delete("/mfa/totp", async ({ request }) => {
    const { clerkUserId } = await requireAuth(request);
    await removeMfa(clerkUserId);
    return { ok: true };
  });
