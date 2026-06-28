import { createClerkClient, type ClerkClient } from "@clerk/backend";

let clerkClient: ClerkClient | null = null;

/** Clerk backend client for the INTRANET Clerk instance. */
export function getClerkClient(): ClerkClient {
  if (clerkClient) return clerkClient;
  const secretKey =
    process.env.INTRANET_CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY;
  const publishableKey =
    process.env.NEXT_PUBLIC_INTRANET_CLERK_PUBLISHABLE_KEY ??
    process.env.INTRANET_CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw new Error(
      "INTRANET_CLERK_SECRET_KEY and a publishable key must be set to verify requests"
    );
  }
  clerkClient = createClerkClient({ secretKey, publishableKey });
  return clerkClient;
}

/**
 * Create a Clerk invitation for `email`, having Clerk send the invitation
 * email. Any still-pending invitation for the same address is revoked first so
 * re-inviting / resending always produces a single fresh ticket. The granted
 * role is stored in `publicMetadata` for reference; the Convex invite row is the
 * authoritative source on acceptance.
 */
export async function createClerkInvitation(opts: {
  email: string;
  role: "admin" | "manager" | "employee";
  invitedByName?: string;
  redirectUrl?: string;
}): Promise<{ invitationId: string }> {
  const clerk = getClerkClient();
  const emailAddress = opts.email.trim().toLowerCase();

  // Best-effort: revoke any still-pending invitations for this address so
  // re-inviting/resending doesn't leave stale tickets around. `ignoreExisting`
  // below guarantees the new invitation is still created even if this fails.
  try {
    const existing = await clerk.invitations.getInvitationList({
      status: "pending",
      query: emailAddress,
      limit: 100,
    });
    await Promise.all(
      existing.data
        .filter(inv => inv.emailAddress.toLowerCase() === emailAddress)
        .map(inv => clerk.invitations.revokeInvitation(inv.id))
    );
  } catch (error) {
    console.error("[clerk] failed to revoke prior invitations:", error);
  }

  const redirectUrl =
    opts.redirectUrl ??
    `${process.env.INTRANET_URL ?? "https://intranet.advantisgroup.de"}/sign-up`;

  const invitation = await clerk.invitations.createInvitation({
    emailAddress,
    redirectUrl,
    notify: true,
    ignoreExisting: true,
    publicMetadata: {
      intranetRole: opts.role,
      ...(opts.invitedByName ? { invitedBy: opts.invitedByName } : {}),
    },
  });
  return { invitationId: invitation.id };
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
