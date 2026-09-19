import { type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { Elysia, t } from "elysia";

import { unlockVaultWithPasskey } from "../lib/applicantVault.js";
import { rateLimit } from "../lib/rate-limit.js";
import { requireFirstPartyOrigin, authed } from "../lib/middleware.js";

export const applicantVaultRoute = new Elysia().use(authed).post(
  "/applicant-vault/unlock-passkey",
  async ({ caller, request, body }) => {
    requireFirstPartyOrigin(request);
    const { clerkUserId } = caller;
    await rateLimit("applicant-vault-unlock-passkey", clerkUserId, 20, "10 m");
    await unlockVaultWithPasskey(
      clerkUserId,
      body.flowId,
      body.response as AuthenticationResponseJSON,
    );
    return { ok: true };
  },
  {
    signedIn: true,
    body: t.Object({ flowId: t.String(), response: t.Any() }),
  },
);
