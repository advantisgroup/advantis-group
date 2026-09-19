import { Elysia, t } from "elysia";

import {
  beginEnrollment,
  finishEnrollment,
  getStatus,
  regenerateRecoveryCodes,
  removeMfa,
} from "../lib/totp.js";
import { destructiveStepUpHint } from "../lib/stepUp.js";
import { Errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireFirstPartyOrigin, authed } from "../lib/middleware.js";

export const totpRoute = new Elysia()
  .use(authed)
  .get(
    "/mfa/totp/status",
    async ({ caller, request }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = caller;
      return await getStatus(clerkUserId);
    },
    { signedIn: true },
  )
  .post(
    "/mfa/totp/enroll",
    async ({ caller, request }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = caller;
      await rateLimit("totp-enroll", clerkUserId, 10, "1 h");
      return await beginEnrollment(clerkUserId);
    },
    { signedIn: true },
  )
  .post(
    "/mfa/totp/enroll/verify",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId } = caller;
      await rateLimit("totp-enroll", clerkUserId, 10, "1 h");
      return await finishEnrollment(clerkUserId, body.code);
    },
    {
      signedIn: true,
      body: t.Object({ code: t.String() }),
    },
  )
  // Gated like a removal: new codes silently void whatever the user has
  // written down, so an attacker could use this to strip the recovery path
  // without ever touching the authenticator itself.
  .post(
    "/mfa/totp/recovery-codes",
    async ({ caller, request }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("totp-recovery", clerkUserId, 5, "1 h");
      const hint = await destructiveStepUpHint(clerkUserId, sessionId);
      if (hint) return hint;
      return await regenerateRecoveryCodes(clerkUserId);
    },
    { signedIn: true },
  )
  // Taking the second factor away is the one thing a stolen session most
  // wants to do, so it costs a fresh check — see `destructiveRequirement`.
  .delete(
    "/mfa/totp",
    async ({ caller, request }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      const hint = await destructiveStepUpHint(clerkUserId, sessionId);
      if (hint) return hint;
      await removeMfa(clerkUserId);
      return { ok: true };
    },
    { signedIn: true },
  );
