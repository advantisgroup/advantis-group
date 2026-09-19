import { type WithoutSystemFields } from "convex/server";

import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";
import { type Role, getUserByClerkId, isAdminEmail, isEmailDomainAllowed } from "../../lib/auth";

export type EnsureUserResult =
  | { status: "active"; userId: Id<"users">; role: Role }
  | { status: "needs_request"; email: string; domainAllowed: boolean }
  | { status: "unauthenticated" };

type NewUser = Omit<WithoutSystemFields<Doc<"users">>, "status" | "removedAt" | "removedBy">;

/**
 * Add someone to the intranet. If they were removed before, their old row
 * comes back instead of a new one, so their history stays attached to them.
 */
export async function createOrRestoreUser(ctx: MutationCtx, user: NewUser): Promise<Id<"users">> {
  const removed = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", user.email))
    .filter((q) => q.eq(q.field("status"), "removed"))
    .first();
  if (!removed) return ctx.db.insert("users", { ...user, status: "active" });

  const { createdAt: _createdAt, ...rest } = user;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  await ctx.db.patch(removed._id, {
    ...defined,
    status: "active",
    removedAt: undefined,
    removedBy: undefined,
  });
  return removed._id;
}

/**
 * Idempotently provision the signed-in Clerk identity into an intranet `users`
 * row. Promotion rules, in order:
 *   1. existing user → refresh profile + lastSeenAt
 *   2. same verified email on another Clerk id → relink the row to this one
 *   3. email in ADMIN_EMAILS → create admin
 *   4. matching pending invite → consume it, create user with the invited role
 *   5. otherwise → no row; caller routes the user to "request access"
 *
 * Removed members only come back through 3 or 4. The email is read from the
 * verified JWT `email` claim, never from client input, so admin seeding
 * cannot be spoofed.
 */
export async function ensureUser(ctx: MutationCtx): Promise<EnsureUserResult> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { status: "unauthenticated" };

  const clerkUserId = identity.subject;
  const email = (identity.email ?? "").toLowerCase();
  const firstName = identity.givenName ?? undefined;
  const lastName = identity.familyName ?? undefined;

  if (!email) {
    console.log(`[ensureUser] identity ${clerkUserId} has no email claim on its JWT yet`);
  }

  // Whether this identity's email domain sits outside the company allowlist.
  // Externals are full members; the flag only drives the admin grouping.
  const external = email ? !isEmailDomainAllowed(email) : false;

  // Rows from before the Clerk instance merge carry the old instance's id —
  // relinking here is what lets getCurrentUser's email fallback retire.
  const byClerkId = await getUserByClerkId(ctx, clerkUserId);
  const existing =
    byClerkId ??
    (email
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", email))
          .filter((q) => q.neq(q.field("status"), "removed"))
          .first()
      : null);
  if (existing && existing.status !== "removed") {
    await ctx.db.patch(existing._id, {
      lastSeenAt: Date.now(),
      ...(existing.clerkUserId !== clerkUserId ? { clerkUserId } : {}),
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

  if (email && isAdminEmail(email)) {
    const userId = await createOrRestoreUser(ctx, {
      clerkUserId,
      email,
      firstName,
      lastName,
      role: "admin",
      external,
      createdAt: now,
      lastSeenAt: now,
    });
    return { status: "active", userId, role: "admin" };
  }

  if (email) {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (!invite) {
      console.log(`[ensureUser] no pending invite for ${email}`);
    } else if (invite.expiresAt <= now) {
      console.log(`[ensureUser] invite for ${email} expired at ${invite.expiresAt}`);
    }

    if (invite && invite.expiresAt > now) {
      const userId = await createOrRestoreUser(ctx, {
        clerkUserId,
        email,
        firstName,
        lastName,
        role: invite.role,
        external,
        createdAt: now,
        lastSeenAt: now,
        // Pre-filled by an inviter via the /admin/onboard personal-email
        // flow — a plain email+role invite (/admin/invites) leaves these
        // unset, and the employee fills them in themselves on first login.
        ...(invite.departmentId ? { departmentId: invite.departmentId } : {}),
        ...(invite.jobTitle ? { jobTitle: invite.jobTitle } : {}),
        ...(invite.phone ? { phone: invite.phone } : {}),
      });
      for (const teamId of invite.teamIds ?? []) {
        await ctx.db.insert("userTeams", { userId, teamId });
      }
      await ctx.db.patch(invite._id, {
        status: "accepted",
        acceptedAt: now,
      });
      console.log(`[ensureUser] consumed invite for ${email}, role=${invite.role}`);
      return { status: "active", userId, role: invite.role };
    }
  }

  return {
    status: "needs_request",
    email,
    domainAllowed: email ? isEmailDomainAllowed(email) : false,
  };
}
