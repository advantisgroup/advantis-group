import { ConvexError } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";

export type Role = Doc<"users">["role"];

// --- Env helpers -------------------------------------------------------------

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry.length > 0);
}

/** Admin emails seeded via the `ADMIN_EMAILS` Convex env var. */
export function getAdminEmails(): string[] {
  return parseList(process.env.ADMIN_EMAILS);
}

/** Allowed company sign-up domains (e.g. "advantisgroup.de"). */
export function getAllowedDomains(): string[] {
  return parseList(process.env.ALLOWED_EMAIL_DOMAINS);
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

/** True if no allowlist is configured, or the email's domain is allowed. */
export function isEmailDomainAllowed(email: string): boolean {
  const allowed = getAllowedDomains();
  if (allowed.length === 0) return true;
  return allowed.includes(emailDomain(email));
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.toLowerCase());
}

// --- Identity / user resolution ---------------------------------------------

export async function getUserByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string
): Promise<Doc<"users"> | null> {
  return ctx.db
    .query("users")
    .withIndex("by_clerkUserId", q => q.eq("clerkUserId", clerkUserId))
    .unique();
}

/**
 * The current intranet user, or null when the request is unauthenticated or the
 * authenticated Clerk identity has not (yet) been provisioned an intranet
 * account. Never throws — callers decide how to handle the null case.
 */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return getUserByClerkId(ctx, identity.subject);
}

/** Like getCurrentUser but throws when there is no active intranet account. */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "unauthenticated",
      message: "Not signed in",
    });
  }
  if (user.status === "suspended") {
    throw new ConvexError({ code: "forbidden", message: "Account suspended" });
  }
  return user;
}

/** Require the current user to hold one of the given roles. */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: readonly Role[]
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!roles.includes(user.role)) {
    throw new ConvexError({
      code: "forbidden",
      message: "You do not have permission to do that",
    });
  }
  return user;
}

export const MANAGER_ROLES: readonly Role[] = ["admin", "manager"];

export async function requireManager(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  return requireRole(ctx, MANAGER_ROLES);
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  return requireRole(ctx, ["admin"]);
}

// --- Provisioning ------------------------------------------------------------

export type EnsureUserResult =
  | { status: "active"; userId: Doc<"users">["_id"]; role: Role }
  | { status: "needs_request"; email: string; domainAllowed: boolean }
  | { status: "unauthenticated" };

/**
 * Idempotently provision the signed-in Clerk identity into an intranet `users`
 * row. Promotion rules, in order:
 *   1. existing user → refresh profile + lastSeenAt
 *   2. email in ADMIN_EMAILS → create admin
 *   3. matching pending invite → consume it, create user with the invited role
 *   4. otherwise → no row; caller routes the user to "request access"
 *
 * The email is read from the verified JWT `email` claim, never from client
 * input, so admin seeding cannot be spoofed.
 */
export async function ensureUser(ctx: MutationCtx): Promise<EnsureUserResult> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { status: "unauthenticated" };

  const clerkUserId = identity.subject;
  const email = (identity.email ?? "").toLowerCase();
  const firstName = identity.givenName ?? undefined;
  const lastName = identity.familyName ?? undefined;

  // Whether this identity's email domain sits outside the company allowlist.
  // Externals are full members; the flag only drives the admin grouping.
  const external = email ? !isEmailDomainAllowed(email) : false;

  const existing = await getUserByClerkId(ctx, clerkUserId);
  if (existing) {
    await ctx.db.patch(existing._id, {
      lastSeenAt: Date.now(),
      // keep profile fresh from the identity provider when fields are present
      ...(firstName && !existing.firstName ? { firstName } : {}),
      ...(lastName && !existing.lastName ? { lastName } : {}),
      ...(email && existing.email !== email ? { email } : {}),
      // backfill the external flag for rows provisioned before it existed
      ...(existing.external === undefined ? { external } : {}),
    });
    return { status: "active", userId: existing._id, role: existing.role };
  }

  const now = Date.now();

  // 2. Admin seeding from env.
  if (email && isAdminEmail(email)) {
    const userId = await ctx.db.insert("users", {
      clerkUserId,
      email,
      firstName,
      lastName,
      role: "admin",
      status: "active",
      external,
      createdAt: now,
      lastSeenAt: now,
    });
    return { status: "active", userId, role: "admin" };
  }

  // 3. Pending invite for this email.
  if (email) {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_email", q => q.eq("email", email))
      .filter(q => q.eq(q.field("status"), "pending"))
      .first();

    if (invite && invite.expiresAt > now) {
      const userId = await ctx.db.insert("users", {
        clerkUserId,
        email,
        firstName,
        lastName,
        role: invite.role,
        status: "active",
        external,
        createdAt: now,
        lastSeenAt: now,
      });
      await ctx.db.patch(invite._id, {
        status: "accepted",
        acceptedAt: now,
      });
      return { status: "active", userId, role: invite.role };
    }
  }

  // 4. No automatic access.
  return {
    status: "needs_request",
    email,
    domainAllowed: email ? isEmailDomainAllowed(email) : false,
  };
}
