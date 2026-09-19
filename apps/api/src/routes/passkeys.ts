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
import { clientIp } from "../lib/client-ip.js";
import { destructiveStepUpHint } from "../lib/stepUp.js";
import { Errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { authed } from "../lib/middleware.js";

export const passkeysRoute = new Elysia()
  .use(authed)
  .get(
    "/passkeys",
    async ({ caller, request }) => {
      requirePasskeyOrigin(request);
      const { clerkUserId } = caller;
      return { passkeys: await listPasskeys(clerkUserId) };
    },
    { signedIn: true },
  )
  .post(
    "/passkeys/registration/options",
    async ({ caller, request }) => {
      requirePasskeyOrigin(request);
      const { clerkUserId } = caller;
      await rateLimit("passkey-registration", clerkUserId, 20, "1 h");
      return await beginRegistration(clerkUserId);
    },
    { signedIn: true },
  )
  .post(
    "/passkeys/registration/verify",
    async ({ caller, request, body }) => {
      requirePasskeyOrigin(request);
      const { clerkUserId } = caller;
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
    {
      signedIn: true,
      body: t.Object({ flowId: t.String(), name: t.String(), response: t.Any() }),
    },
  )
  .post("/passkeys/authentication/options", async ({ request }) => {
    requirePasskeyOrigin(request);
    await rateLimit("passkey-authentication", clientIp(request), 20, "10 m");
    return await beginAuthentication();
  })
  .post(
    "/passkeys/authentication/verify",
    async ({ request, body }) => {
      requirePasskeyOrigin(request);
      await rateLimit("passkey-authentication", clientIp(request), 20, "10 m");
      return await finishAuthentication(body.flowId, body.response as AuthenticationResponseJSON);
    },
    { body: t.Object({ flowId: t.String(), response: t.Any() }) },
  )
  .patch(
    "/passkeys/:id",
    async ({ caller, request, params, body }) => {
      requirePasskeyOrigin(request);
      const { clerkUserId } = caller;
      return { passkey: await renamePasskey(clerkUserId, params.id, body.name) };
    },
    {
      signedIn: true,
      params: t.Object({ id: t.String() }),
      body: t.Object({ name: t.String() }),
    },
  )
  // Adding a passkey is deliberately not gated: it never weakens the
  // account, and the sign-in gate's enrollment step would deadlock against a
  // check the user has no credential to pass yet. Removal is the direction
  // that costs something.
  .delete(
    "/passkeys/:id",
    async ({ caller, request, params }) => {
      requirePasskeyOrigin(request);
      const { clerkUserId, sessionId } = caller;
      if (!sessionId) throw Errors.badRequest("No active session");
      const hint = await destructiveStepUpHint(clerkUserId, sessionId);
      if (hint) return hint;
      return { ok: true, signal: await removePasskey(clerkUserId, params.id) };
    },
    { signedIn: true },
  );
