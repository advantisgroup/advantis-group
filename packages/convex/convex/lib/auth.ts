import { ConvexError } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";

export type Role = Doc<"users">["role"];
export type Capability = Doc<"customRoles">["capabilities"][number];

// --- Env helpers -------------------------------------------------------------

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
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
  clerkUserId: string,
): Promise<Doc<"users"> | null> {
  return ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

/**
 * The current intranet user, or null when the request is unauthenticated or the
 * authenticated Clerk identity has not (yet) been provisioned an intranet
 * account. Never throws — callers decide how to handle the null case.
 *
 * Marketing and the intranet now share a single Clerk instance (see
 * auth.config.ts), so `subject` lookups are the primary path. The email
 * fallback below is legacy-compat only, for any session issued while
 * marketing and the intranet were still on separate Clerk instances with
 * different `subject`s for the same person.
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const byClerkId = await getUserByClerkId(ctx, identity.subject);
  if (byClerkId) return byClerkId;

  const email = (identity.email ?? "").toLowerCase();
  if (!email) return null;
  return ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

/** Like getCurrentUser but throws when there is no active intranet account. */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
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
  roles: readonly Role[],
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

export async function requireManager(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  return requireRole(ctx, MANAGER_ROLES);
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  return requireRole(ctx, ["admin"]);
}

/**
 * True when `user` is either `ownerId` themselves or an admin — the
 * "author/creator or admin can edit/delete" rule repeated across
 * announcements, events, chat messages and guidebook pages/attachments.
 * A pure predicate (not throwing) so it works both for gating a mutation
 * and for filtering a list to what's visible.
 */
export function isOwnerOrAdmin(user: Doc<"users">, ownerId: Doc<"users">["_id"]): boolean {
  return ownerId === user._id || user.role === "admin";
}

/**
 * True when `actor` may grant `role` to someone else: anyone can grant
 * "employee", but only an admin can grant manager/admin. Shared by invites
 * and access-request approval, which both enforce this same escalation
 * rule independently.
 */
export function canGrantRole(actor: Doc<"users">, role: Role): boolean {
  return role === "employee" || actor.role === "admin";
}

/**
 * Require the current user to hold `capability` — satisfied automatically by
 * the manager/admin tiers, or by an employee whose assigned `customRoleId`
 * grants it. Capabilities are additive: they never take away what the base
 * role tier already allows.
 */
export async function requireCapability(
  ctx: QueryCtx | MutationCtx,
  capability: Capability,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (MANAGER_ROLES.includes(user.role)) return user;

  const customRole = user.customRoleId ? await ctx.db.get(user.customRoleId) : null;
  if (!customRole?.capabilities.includes(capability)) {
    throw new ConvexError({
      code: "forbidden",
      message: "You do not have permission to do that",
    });
  }
  return user;
}

/**
 * True when `user` qualifies to be granted Applicant Management access: at
 * least Manager (admins qualify too), or an employee whose custom role
 * carries `manage_members`. This is a data-sensitivity gate on the *target*
 * of a grant, independent of who's doing the granting — it applies even when
 * an admin is the one granting.
 */
export function isApplicantEligible(
  user: Doc<"users">,
  customRole: Doc<"customRoles"> | null,
): boolean {
  return (
    MANAGER_ROLES.includes(user.role) ||
    (customRole?.capabilities.includes("manage_members") ?? false)
  );
}

/**
 * Applicant Management "vault": a shared secondary password gating the whole
 * feature on top of the checks below — defense-in-depth against a leaked or
 * unattended session. Deliberately no admin bypass: an admin's session is
 * just as exposed as anyone else's, and the point of this layer is to
 * survive exactly that case. Throws a distinct `vault_locked` code (rather
 * than `forbidden`) so the client can show an unlock prompt instead of a
 * generic access-denied screen.
 */
export async function requireVaultUnlocked(
  ctx: QueryCtx | MutationCtx,
  userId: Doc<"users">["_id"],
): Promise<void> {
  const unlock = await ctx.db
    .query("applicantVaultUnlocks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!unlock || unlock.expiresAt <= Date.now()) {
    throw new ConvexError({
      code: "vault_locked",
      message: "Applicant Management is locked — please re-enter the password.",
    });
  }
}

/** True when `user` has Applicant Management access: an admin, or granted
 * `applicantAccess` directly. Used both to gate the caller (via
 * `requireApplicantAccess`) and to resolve a *target* user's eligibility
 * elsewhere (e.g. the API's own `apiCheckAccess`). Takes just the fields it
 * needs so it also accepts the curated `users.me` shape, not only a raw
 * `Doc<"users">` — both `setPassword`/`unlock` (actions, round-tripping
 * through `api.users.me`) and direct-db callers can share it. */
export function hasApplicantAccess(user: Pick<Doc<"users">, "role" | "applicantAccess">): boolean {
  return user.role === "admin" || user.applicantAccess === true;
}

/** Require the current user to have Applicant Management access (admin bypasses
 * the role/delegate check, but not the vault). */
export async function requireApplicantAccess(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!hasApplicantAccess(user)) {
    throw new ConvexError({
      code: "forbidden",
      message: "You do not have permission to do that",
    });
  }
  await requireVaultUnlocked(ctx, user._id);
  return user;
}

/**
 * Require the current user to be able to grant/revoke Applicant Management
 * access for others: an admin, or a user designated as a delegate.
 */
export async function requireApplicantDelegateOrAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin" && !user.applicantAccessDelegate) {
    throw new ConvexError({
      code: "forbidden",
      message: "You do not have permission to do that",
    });
  }
  await requireVaultUnlocked(ctx, user._id);
  return user;
}

/** True when `user` belongs to the Applicant Management area at all: an
 * admin, or granted either `applicantAccess` or `applicantAccessDelegate`.
 * Same narrow-field shape as `hasApplicantAccess`, for the same reason —
 * shared by direct-db callers and the action call sites round-tripping
 * through `api.users.me`. */
export function isApplicantAreaMember(
  user: Pick<Doc<"users">, "role" | "applicantAccess" | "applicantAccessDelegate">,
): boolean {
  return (
    user.role === "admin" ||
    user.applicantAccess === true ||
    user.applicantAccessDelegate === true
  );
}

/** Require Applicant Management access OR delegate rights, without the vault
 * check — used only by the vault's own bootstrap functions (checking status,
 * unlocking), which must work precisely when the vault is still locked. */
export async function requireApplicantAreaMember(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (isApplicantAreaMember(user)) return user;
  throw new ConvexError({
    code: "forbidden",
    message: "You do not have permission to do that",
  });
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
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
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
