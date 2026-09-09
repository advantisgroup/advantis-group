import { Elysia, t } from "elysia";

import { beginEnrollment, finishEnrollment, getStatus, removeMfa } from "../lib/totp.js";
import { destructiveStepUpHint } from "../lib/stepUp.js";
import { Errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireAuth, requireFirstPartyOrigin } from "../lib/middleware.js";

export const totpRoute = new Elysia()
  .get("/mfa/totp/status", async ({ request }) => {
    requireFirstPartyOrigin(request);
    const { clerkUserId } = await requireAuth(request);
    return await getStatus(clerkUserId);
  })
  .post("/mfa/totp/enroll", async ({ request }) => {
    requireFirstPartyOrigin(request);
    const { clerkUserId } = await requireAuth(request);
    await rateLimit("totp-enroll", clerkUserId, 10, "1 h");
    return await beginEnrollment(clerkUserId);
  })
  .post(
    "/mfa/totp/enroll/verify",
    async ({ request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("totp-enroll", clerkUserId, 10, "1 h");
      return await finishEnrollment(clerkUserId, body.code);
    },
    { body: t.Object({ code: t.String() }) },
  )
  // Taking the second factor away is the one thing a stolen session most
  // wants to do, so it costs a fresh check — see `destructiveRequirement`.
  .delete("/mfa/totp", async ({ request }) => {
    requireFirstPartyOrigin(request);
    const { clerkUserId, sessionId } = await requireAuth(request);
    if (!sessionId) throw Errors.badRequest("No active session");
    const hint = await destructiveStepUpHint(clerkUserId, sessionId);
    if (hint) return hint;
    await removeMfa(clerkUserId);
    return { ok: true };
  });
