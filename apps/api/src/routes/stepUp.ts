import { Elysia, t } from "elysia";

import {
  claimPasskeyTicket,
  evaluateDevice,
  requestStepUpCode,
  verifyStepUp,
  verifyStepUpPasskey,
} from "../lib/stepUp.js";
import { clientIp } from "../lib/client-ip.js";
import { Errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireFirstPartyOrigin, authed } from "../lib/middleware.js";

const contextSchema = t.Union([
  t.Literal("sign_in"),
  t.Literal("destructive"),
  t.Literal("admin_reverify"),
  t.Literal("area_reverify"),
]);
// Only sent alongside context "area_reverify".
const areaSchema = t.Optional(t.Union([t.Literal("performance"), t.Literal("applicant_vault")]));

export const stepUpRoute = new Elysia()
  .use(authed)
  .post(
    "/auth/step-up/request-code",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("step-up-request", clerkUserId, 5, "10 m");
      await requestStepUpCode(clerkUserId, sessionId, body.context);
      return { ok: true };
    },
    {
      signedIn: true,
      body: t.Object({ context: contextSchema }),
    },
  )
  .post(
    "/auth/step-up/verify",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("step-up-verify", clerkUserId, 20, "10 m");
      return await verifyStepUp(
        clerkUserId,
        sessionId,
        body.method,
        body.code,
        body.context,
        body.area,
      );
    },
    {
      signedIn: true,
      body: t.Object({
        method: t.Union([t.Literal("email_code"), t.Literal("totp"), t.Literal("recovery_code")]),
        code: t.String(),
        context: contextSchema,
        area: areaSchema,
      }),
    },
  )
  /** Re-verify the current session with a passkey. The challenge comes from
   * the shared `/passkeys/authentication/options`; only the redemption is
   * step-up specific. */
  .post(
    "/auth/step-up/verify-passkey",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("step-up-verify", clerkUserId, 20, "10 m");
      return await verifyStepUpPasskey(
        clerkUserId,
        sessionId,
        body.flowId,
        body.response as never,
        body.context,
        body.area,
      );
    },
    {
      signedIn: true,
      body: t.Object({
        flowId: t.String(),
        response: t.Unknown(),
        context: contextSchema,
        area: areaSchema,
      }),
    },
  )
  .post(
    "/auth/step-up/claim-passkey",
    async ({ caller, request, body }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      return { ok: await claimPasskeyTicket(clerkUserId, sessionId, body.ticket) };
    },
    {
      signedIn: true,
      body: t.Object({ ticket: t.String() }),
    },
  )
  .get(
    "/auth/step-up/evaluate-device",
    async ({ caller, request }) => {
      requireFirstPartyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      const userAgent = request.headers.get("user-agent") ?? "unknown";
      return await evaluateDevice(clerkUserId, sessionId, clientIp(request), userAgent);
    },
    { signedIn: true },
  );
