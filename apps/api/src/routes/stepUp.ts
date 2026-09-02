import { Elysia, t } from "elysia";

import { claimPasskeyTicket, evaluateDevice, requestStepUpCode, verifyStepUp } from "../lib/stepUp.js";
import { Errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireAuth } from "../lib/middleware.js";

const contextSchema = t.Union([
  t.Literal("sign_in"),
  t.Literal("destructive"),
  t.Literal("admin_reverify"),
]);

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const stepUpRoute = new Elysia()
  .post(
    "/auth/step-up/request-code",
    async ({ request, body }) => {
      const { clerkUserId, sessionId } = await requireAuth(request);
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("step-up-request", clerkUserId, 5, "10 m");
      await requestStepUpCode(clerkUserId, sessionId, body.context);
      return { ok: true };
    },
    { body: t.Object({ context: contextSchema }) },
  )
  .post(
    "/auth/step-up/verify",
    async ({ request, body }) => {
      const { clerkUserId, sessionId } = await requireAuth(request);
      if (!sessionId) throw Errors.badRequest("No active session");
      await rateLimit("step-up-verify", clerkUserId, 20, "10 m");
      return await verifyStepUp(clerkUserId, sessionId, body.method, body.code, body.context);
    },
    {
      body: t.Object({
        method: t.Union([t.Literal("email_code"), t.Literal("totp"), t.Literal("recovery_code")]),
        code: t.String(),
        context: contextSchema,
      }),
    },
  )
  .post(
    "/auth/step-up/claim-passkey",
    async ({ request, body }) => {
      const { clerkUserId, sessionId } = await requireAuth(request);
      if (!sessionId) throw Errors.badRequest("No active session");
      return { ok: await claimPasskeyTicket(clerkUserId, sessionId, body.ticket) };
    },
    { body: t.Object({ ticket: t.String() }) },
  )
  .get("/auth/step-up/evaluate-device", async ({ request }) => {
    const { clerkUserId, sessionId } = await requireAuth(request);
    if (!sessionId) throw Errors.badRequest("No active session");
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    return await evaluateDevice(clerkUserId, sessionId, clientIp(request), userAgent);
  });
