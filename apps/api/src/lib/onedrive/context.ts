import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "../types.js";

import { getConvex, getConvexServerKey } from "../convex.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware.js";
import { type AccessUser } from "./access.js";

/** The signed-in intranet user, with the flags needed for access decisions. */
export interface OneDriveUser extends AccessUser {
  clerkUserId: string;
  userId: Id<"users">;
  name: string;
  email: string;
  role: Role;
  canAccessFiles: boolean;
  canWriteWiki: boolean;
  canWriteHR: boolean;
}

/**
 * Authenticate the Clerk session, then resolve the matching intranet user (role
 * + OneDrive flags) from Convex. This is the identity every OneDrive route
 * starts from — Graph itself only ever sees the service account.
 */
export async function resolveOneDriveUser(request: Request): Promise<OneDriveUser> {
  const { clerkUserId } = await requireAuth(request);
  const ctx = await getConvex().query(api.onedrive.apiUserContext, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
  if (!ctx) throw Errors.forbidden("No active intranet account");
  return {
    clerkUserId,
    userId: ctx.userId,
    name: ctx.name,
    email: ctx.email,
    role: ctx.role,
    gfAccess: ctx.gfAccess,
    uploadRequestsEnabled: ctx.uploadRequestsEnabled,
    canAccessFiles: ctx.canAccessFiles,
    canWriteWiki: ctx.canWriteWiki,
    canWriteHR: ctx.canWriteHR,
  };
}

/** Full file-browser routes (listing, search, quota…) also admit a user who
 * only holds the wiki/HR indirect grant — `assertWithinBrowsableScope` then
 * confines what they can actually see to their own subtree. */
export function requireFileBrowserAccess(user: OneDriveUser): void {
  if (!user.canAccessFiles && !user.canWriteWiki && !user.canWriteHR) {
    throw Errors.forbidden("Files access required");
  }
}

export function requireManagerUser(user: OneDriveUser): void {
  if (user.role !== "admin" && user.role !== "manager") {
    throw Errors.forbidden("Manager access required");
  }
}
