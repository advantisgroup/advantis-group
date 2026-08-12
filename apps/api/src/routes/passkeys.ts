import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Elysia, t } from "elysia";

import {
  beginAuthentication,
  beginRegistration,
  finishAuthentication,
  finishRegistration,
  listPasskeys,
  removePasskey,
  renamePasskey,
  requirePasskeyOrigin,
} from "../lib/passkeys.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireAuth } from "../lib/middleware.js";

function requesterKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const passkeysRoute = new Elysia()
  .get("/passkeys", async ({ request }) => {
    requirePasskeyOrigin(request);
    const { clerkUserId } = await requireAuth(request);
    return { passkeys: await listPasskeys(clerkUserId) };
  })
  .post("/passkeys/registration/options", async ({ request }) => {
    requirePasskeyOrigin(request);
    const { clerkUserId } = await requireAuth(request);
    await rateLimit("passkey-registration", clerkUserId, 20, "1 h");
    return await beginRegistration(clerkUserId);
  })
  .post(
    "/passkeys/registration/verify",
    async ({ request, body }) => {
      requirePasskeyOrigin(request);
      const { clerkUserId } = await requireAuth(request);
      await rateLimit("passkey-registration", clerkUserId, 20, "1 h");
      return {
        passkey: await finishRegistration(
          clerkUserId,
          body.flowId,
          body.response as RegistrationResponseJSON,
          body.name,
        ),
      };
    },
    { body: t.Object({ flowId: t.String(), name: t.String(), response: t.Any() }) },
  )
  .post("/passkeys/authentication/options", async ({ request }) => {
    requirePasskeyOrigin(request);
    await rateLimit("passkey-authentication", requesterKey(request), 20, "10 m");
    return await beginAuthentication();
  })
  .post(
    "/passkeys/authentication/verify",
    async ({ request, body }) => {
      requirePasskeyOrigin(request);
      await rateLimit("passkey-authentication", requesterKey(request), 20, "10 m");
      return {
        ticket: await finishAuthentication(
          body.flowId,
          body.response as AuthenticationResponseJSON,
        ),
      };
    },
    { body: t.Object({ flowId: t.String(), response: t.Any() }) },
  )
  .patch(
    "/passkeys/:id",
    async ({ request, params, body }) => {
      requirePasskeyOrigin(request);
      const { clerkUserId } = await requireAuth(request);
      return { passkey: await renamePasskey(clerkUserId, params.id, body.name) };
    },
    { params: t.Object({ id: t.String() }), body: t.Object({ name: t.String() }) },
  )
  .delete("/passkeys/:id", async ({ request, params }) => {
    requirePasskeyOrigin(request);
    const { clerkUserId } = await requireAuth(request);
    await removePasskey(clerkUserId, params.id);
    return { ok: true };
  });
