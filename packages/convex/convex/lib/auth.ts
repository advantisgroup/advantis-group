import { ConvexError, type Infer } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { type capabilityValidator } from "./validators";

/**
 * Identity and role basics. Permission checks for the person making a request
 * live on `Caller` (lib/caller.ts) and the builders in functions.ts; this file
 * is what they're built from.
 */

export type Role = Doc<"users">["role"];
export type Capability = Infer<typeof capabilityValidator>;
export type SandboxRole = Exclude<Role, "admin">;

/** A role's stored capabilities minus retired ones (see `storedCapabilityValidator`). */
export function liveCapabilities(capabilities: Doc<"customRoles">["capabilities"]): Capability[] {
  return capabilities.filter((c): c is Capability => c !== "view_activity_admin");
}

type RoleView = Pick<Doc<"users">, "role"> & { sandboxRole?: SandboxRole | null };

export const MANAGER_ROLES: readonly Role[] = ["admin", "manager"];

export function effectiveRole(user: RoleView): Role {
  return user.sandboxRole ?? user.role;
}

export function isSandboxed(user: { sandboxRole?: SandboxRole | null }): boolean {
  return user.sandboxRole != null;
}

/**
 * A user's effective custom-role ids: the new `customRoleIds` array, falling
 * back to the legacy singular `customRoleId` for rows `migrations/
 * backfillCustomRoleIds.ts` hasn't reached yet. Every reader of custom roles
 * goes through this so the fallback lives in exactly one place.
 */
export function effectiveCustomRoleIds(
  user: Pick<Doc<"users">, "customRoleIds" | "customRoleId">,
): Id<"customRoles">[] {
  if (user.customRoleIds && user.customRoleIds.length > 0) return user.customRoleIds;
  return user.customRoleId ? [user.customRoleId] : [];
}

// --- Env ---------------------------------------------------------------------

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

function emailDomain(email: string): string {
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

// --- Server-to-server (apps/api) --------------------------------------------

/** Gate for the functions apps/api calls with the shared server key —
 * apps/api has already authenticated the real caller before reaching here. */
export function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

// --- Identity -----------------------------------------------------------------

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
 * The signed-in person's row whatever its status, or null. Only for the few
 * places that must see a suspended account (the "you're suspended" screen);
 * everything else wants `getSessionCaller`.
 *
 * The email fallback covers rows still carrying an id from before the Clerk
 * instance merge — `ensureUser` relinks those on sign-in.
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
    .filter((q) => q.neq(q.field("status"), "removed"))
    .first();
}
