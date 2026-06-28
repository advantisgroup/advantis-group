import { ConvexError } from "convex/values";

import { type Role } from "./auth";

/**
 * Direct integration with Clerk's Backend API for the intranet Clerk instance.
 *
 * Invitations are created straight from Convex actions rather than proxied
 * through the Elysia API. That removes a fragile server-key handshake between
 * two deployments — the only thing that needs configuring is the Clerk secret
 * key in the Convex environment (`INTERNAL_CLERK_SECRET_KEY`). Clerk itself
 * sends the invitation email and gates sign-up to the invited address, which is
 * also what lets external domains through a restricted sign-up mode.
 */

const CLERK_API = "https://api.clerk.com/v1";

function clerkSecretKey(): string {
  const key =
    process.env.INTERNAL_CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new ConvexError({
      code: "internal",
      message:
        "Clerk is not configured for invitations. Set INTERNAL_CLERK_SECRET_KEY " +
        "in the Convex environment (npx convex env set INTERNAL_CLERK_SECRET_KEY sk_...).",
    });
  }
  return key;
}

async function clerkFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${clerkSecretKey()}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

interface ClerkInvitation {
  id: string;
  email_address: string;
}

/** Pending Clerk invitations for `email` (empty on any list failure). */
async function pendingInvitations(email: string): Promise<ClerkInvitation[]> {
  const res = await clerkFetch(
    `/invitations?status=pending&query=${encodeURIComponent(email)}&limit=100`,
    { method: "GET" }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as
    | { data?: ClerkInvitation[] }
    | ClerkInvitation[];
  const list = Array.isArray(json) ? json : (json.data ?? []);
  return list.filter(i => i.email_address.toLowerCase() === email);
}

/**
 * Lock a Clerk user account (blocks sign-in without deleting the account).
 * Treats 404 as success for idempotency.
 */
export async function lockClerkUser(clerkUserId: string): Promise<void> {
  const res = await clerkFetch(`/users/${clerkUserId}/lock`, { method: "POST" });
  if (!res.ok && res.status !== 404) {
    throw new ConvexError({
      code: "upstream",
      message: `Clerk could not lock the user (HTTP ${res.status}). ${await res.text()}`,
    });
  }
}

/**
 * Unlock a previously locked Clerk user account.
 * Treats 404 as success for idempotency.
 */
export async function unlockClerkUser(clerkUserId: string): Promise<void> {
  const res = await clerkFetch(`/users/${clerkUserId}/unlock`, { method: "POST" });
  if (!res.ok && res.status !== 404) {
    throw new ConvexError({
      code: "upstream",
      message: `Clerk could not unlock the user (HTTP ${res.status}). ${await res.text()}`,
    });
  }
}

/**
 * Permanently delete a Clerk user (revokes their ability to sign in). Treats a
 * 404 as success so removing a member whose Clerk account is already gone still
 * resolves. Throws a `ConvexError` on other failures so the caller can surface
 * it to the admin.
 */
export async function deleteClerkUser(clerkUserId: string): Promise<void> {
  const res = await clerkFetch(`/users/${clerkUserId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new ConvexError({
      code: "upstream",
      message: `Clerk could not delete the user (HTTP ${res.status}). ${await res.text()}`,
    });
  }
}

/** Best-effort revoke of any still-pending Clerk invitations for `email`. */
export async function revokeClerkInvitations(email: string): Promise<void> {
  const addr = email.trim().toLowerCase();
  const pending = await pendingInvitations(addr);
  await Promise.all(
    pending.map(i =>
      clerkFetch(`/invitations/${i.id}/revoke`, { method: "POST" })
    )
  );
}

/**
 * Create — and have Clerk email — an invitation for `email`. Any prior pending
 * invitation for the address is revoked first (best-effort) so re-inviting /
 * resending doesn't leave stale tickets behind; `ignore_existing` still
 * guarantees a fresh invitation is issued. Throws a `ConvexError` when Clerk
 * rejects the request so the caller can surface it to the admin.
 */
export async function createClerkInvitation(opts: {
  email: string;
  role: Role;
  invitedByName?: string;
  redirectUrl?: string;
}): Promise<void> {
  const email = opts.email.trim().toLowerCase();

  try {
    await revokeClerkInvitations(email);
  } catch {
    // Non-fatal: `ignore_existing` below still issues a fresh invitation.
  }

  const redirectUrl =
    opts.redirectUrl ??
    `${process.env.INTERNAL_URL ?? "https://intern.advantisgroup.de"}/sign-up`;

  const res = await clerkFetch("/invitations", {
    method: "POST",
    body: JSON.stringify({
      email_address: email,
      redirect_url: redirectUrl,
      notify: true,
      ignore_existing: true,
      public_metadata: {
        intranetRole: opts.role,
        ...(opts.invitedByName ? { invitedBy: opts.invitedByName } : {}),
      },
    }),
  });

  if (!res.ok) {
    throw new ConvexError({
      code: "upstream",
      message: `Clerk could not create the invitation (HTTP ${res.status}). ${await res.text()}`,
    });
  }
}
