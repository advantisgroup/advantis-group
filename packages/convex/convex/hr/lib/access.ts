import { type Doc } from "../../_generated/dataModel";
import { type SandboxRole, effectiveRole, isSandboxed, MANAGER_ROLES } from "../../lib/auth";

/**
 * Who belongs in Applicant Management. The signed-in person's own access goes
 * through `Caller`; these are the same rules for looking at someone else.
 */

type ApplicantView = Pick<Doc<"users">, "role" | "applicantAccess" | "applicantAccessDelegate"> & {
  sandboxRole?: SandboxRole | null;
};

/**
 * On the HR list (`applicantAccess`). Deliberately no admin bypass: HR holds
 * contracts and payroll, so being admin is not enough — an admin who should
 * see HR is put on the list like anyone else. Never while sandboxed.
 */
export function hasApplicantAccess(user: ApplicantView): boolean {
  return !isSandboxed(user) && user.applicantAccess === true;
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
