import { ConvexError } from "convex/values";

import { type Doc, type Id } from "../../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../../_generated/server";
import { type SandboxRole, effectiveRole, isSandboxed, MANAGER_ROLES } from "../../lib/auth";

/**
 * Who belongs in Applicant Management. The signed-in person's own access goes
 * through `Caller`; these are the same rules for looking at someone else.
 */

type ApplicantView = Pick<Doc<"users">, "role" | "applicantAccess" | "applicantAccessDelegate"> & {
  sandboxRole?: SandboxRole | null;
};

/** An admin, or granted access directly. Never while sandboxed. */
export function hasApplicantAccess(user: ApplicantView): boolean {
  return !isSandboxed(user) && (effectiveRole(user) === "admin" || user.applicantAccess === true);
}

/** An admin, or a designated delegate who can grant access to others. */
export function isApplicantDelegate(user: ApplicantView): boolean {
  return (
    effectiveRole(user) === "admin" || (!isSandboxed(user) && user.applicantAccessDelegate === true)
  );
}

/** Belongs to the area at all — access or delegate rights. */
export function isApplicantAreaMember(user: ApplicantView): boolean {
  return hasApplicantAccess(user) || isApplicantDelegate(user);
}

/**
 * Whether `user` may be *granted* access: at least Manager, or an employee
 * whose custom role carries `manage_members`. A data-sensitivity gate on the
 * target of a grant, whoever is doing the granting.
 */
export function isApplicantEligible(
  user: Doc<"users">,
  customRoles: (Doc<"customRoles"> | null)[],
): boolean {
  return (
    MANAGER_ROLES.includes(user.role) ||
    customRoles.some((role) => role?.capabilities.includes("manage_members") ?? false)
  );
}

/**
 * The vault: a personal secondary password on top of the checks above —
 * defense-in-depth against a leaked or unattended session. Deliberately no
 * admin bypass. Throws `vault_locked` (not `forbidden`) so the client shows an
 * unlock prompt instead of an access-denied screen.
 */
export async function requireVaultUnlocked(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
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
