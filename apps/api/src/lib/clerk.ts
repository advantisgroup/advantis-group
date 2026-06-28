import { createClerkClient, type ClerkClient } from "@clerk/backend";

let clerkClient: ClerkClient | null = null;

/** Clerk backend client for the INTRANET Clerk instance. */
export function getClerkClient(): ClerkClient {
  if (clerkClient) return clerkClient;
  const secretKey =
    process.env.INTERNAL_CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY;
  const publishableKey =
    process.env.NEXT_PUBLIC_INTERNAL_CLERK_PUBLISHABLE_KEY ??
    process.env.INTERNAL_CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw new Error(
      "INTERNAL_CLERK_SECRET_KEY and a publishable key must be set to verify requests"
    );
  }
  clerkClient = createClerkClient({ secretKey, publishableKey });
  return clerkClient;
}

export interface AuthedUser {
  clerkUserId: string;
  sessionId: string | null;
}

/**
 * Verify the incoming request against the intranet Clerk instance (cookie or
 * `Authorization: Bearer`). Returns null when unauthenticated.
 */
export async function authenticate(
  request: Request
): Promise<AuthedUser | null> {
  const clerk = getClerkClient();
  // Clerk re-clones the request body; hand it a headers-only copy so already
  // consumed POST bodies don't throw "body disturbed or locked".
  const headersOnly = new Request(request.url, {
    method: request.method,
    headers: request.headers,
  });
  const state = await clerk.authenticateRequest(headersOnly, {
    acceptsToken: "session_token",
  });
  if (!state.isAuthenticated) return null;
  const auth = state.toAuth();
  if (!auth.userId) return null;
  return { clerkUserId: auth.userId, sessionId: auth.sessionId ?? null };
}
