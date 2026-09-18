import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { api } from "@advantis/convex/api";

import { getConvex, getConvexServerKey } from "./convex.js";
import { Errors } from "./errors.js";
import { verifyAuthenticationAssertion } from "./passkeys.js";

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
