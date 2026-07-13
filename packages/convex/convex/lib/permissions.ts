import { type Doc } from "../_generated/dataModel";

/**
 * Named permissions granted directly on a user (as opposed to a `customRole`,
 * which is an assignable bundle a manager can create/reuse — a different
 * mechanism, kept separate rather than folded in here). Gives callers one
 * shared vocabulary instead of checking `gfAccess`/`uploadRequestsEnabled` as
 * ad hoc booleans wherever they're needed.
 */
export type NamedPermission = "gf_access" | "upload_requests";

/** Every named permission currently granted to `user`. */
export function listUserPermissions(user: Doc<"users">): NamedPermission[] {
  const permissions: NamedPermission[] = [];
  if (user.gfAccess) permissions.push("gf_access");
  // Default-on: undefined means enabled, matching applyUploadPermission's
  // existing convention (see users.ts).
  if (user.uploadRequestsEnabled !== false) {
    permissions.push("upload_requests");
  }
  return permissions;
}

export function hasNamedPermission(
  user: Doc<"users">,
  permission: NamedPermission
): boolean {
  return listUserPermissions(user).includes(permission);
}
