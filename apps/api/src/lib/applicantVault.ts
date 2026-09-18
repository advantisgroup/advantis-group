import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { api } from "@advantis/convex/api";

import { getConvex, getConvexServerKey } from "./convex.js";
import { Errors } from "./errors.js";
import { verifyAuthenticationAssertion } from "./passkeys.js";

/**
 * Phase 4 of docs/future-features/21_auth-consolidation.md: unlocking the
 * Applicant Management vault with a passkey instead of typing its password
 * — an alternative, not a replacement (the password stays as fallback and
 * recovery). Reuses `verifyAuthenticationAssertion`, the same WebAuthn
 * primitive signing in and step-up re-verification already share; the only
 * new part is what happens once the assertion checks out.
 */
export async function unlockVaultWithPasskey(
  clerkUserId: string,
  flowId: string,
  response: AuthenticationResponseJSON,
): Promise<void> {
  const assertion = await verifyAuthenticationAssertion(flowId, response);
  if (assertion.clerkUserId !== clerkUserId) {
    throw Errors.badRequest("That passkey belongs to a different account.");
  }
  await getConvex().mutation(api.applicantVault.apiUnlockViaPasskey, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
}
