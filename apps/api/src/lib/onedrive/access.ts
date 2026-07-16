import { type Role } from "../types.js";

import { Errors } from "../errors.js";

/**
 * OneDrive access control. Every Graph call runs as one all-powerful service
 * account (`chefsache@`), so the *only* place access is enforced is here. Routes
 * resolve the intranet user, then call `classifyAccess(user, path)` before
 * touching Graph. Paths are always relative to the Advantis Group root
 * (`ONEDRIVE_ROOT_PATH`), e.g. "" (root), "Team", "Team/Reports",
 * "Geschäftsführung/2026".
 *
 * Rules (locked in with the user):
 *  - Read:    Team sub-tree → any active user; Geschäftsführung sub-tree →
 *             only users with the `gfAccess` allowlist flag (not tied to rank).
 *  - Write:   manager/admin role AND read-access to that folder (so a manager
 *             still needs `gfAccess` to write into Geschäftsführung).
 *  - Request: an employee with read-access and the (default-on)
 *             `uploadRequestsEnabled` flag may submit an approval request.
 */

/** Minimal view of the intranet user needed for access decisions. */
export interface AccessUser {
  role: Role;
  gfAccess?: boolean;
  /** Defaults to true when undefined. */
  uploadRequestsEnabled?: boolean;
}

export interface AccessResult {
  canRead: boolean;
  canWrite: boolean;
  canRequest: boolean;
}

export interface FolderConfig {
  /** AG root path relative to the OneDrive drive root. */
  root: string;
  /** Team sub-tree, relative to the AG root. */
  team: string;
  /** Geschäftsführung sub-tree, relative to the AG root. */
  gf: string;
}

export function folderConfig(): FolderConfig {
  return {
    root: process.env.ONEDRIVE_ROOT_PATH ?? "Documents/Advantis Group",
    team: process.env.ONEDRIVE_TEAM_PATH ?? "Team",
    gf: process.env.ONEDRIVE_GF_PATH ?? "Geschäftsführung",
  };
}

/** Collapse slashes and strip leading/trailing ones. Never returns "/". */
export function normalizePath(path: string): string {
  return path
    .split("/")
    .map(seg => seg.trim())
    .filter(Boolean)
    .join("/");
}

function isWithin(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/** Which top-level zone a relative path falls into. */
export type Zone = "root" | "team" | "gf" | "other";

export function zoneOf(relPath: string): Zone {
  const path = normalizePath(relPath);
  if (path === "") return "root";
  const { team, gf } = folderConfig();
  if (isWithin(path, team)) return "team";
  if (isWithin(path, gf)) return "gf";
  return "other";
}

const isManagerRole = (role: Role): boolean =>
  role === "admin" || role === "manager";

/**
 * Effective permissions for `user` on the AG-relative `relPath`. The single
 * decision point — routes must call this and never trust client-supplied flags.
 */
export function classifyAccess(
  user: AccessUser,
  relPath: string
): AccessResult {
  const zone = zoneOf(relPath);
  const manager = isManagerRole(user.role);
  const uploadAllowed = user.uploadRequestsEnabled !== false;

  let canRead = false;
  switch (zone) {
    case "root":
    case "team":
      canRead = true;
      break;
    case "gf":
      canRead = user.gfAccess === true;
      break;
    case "other":
      // Unknown top-level folders under the AG root are hidden by default;
      // only the allowlist may see them, mirroring Geschäftsführung.
      canRead = user.gfAccess === true;
      break;
  }

  const canWrite = canRead && manager;
  const canRequest = canRead && !manager && uploadAllowed;

  return { canRead, canWrite, canRequest };
}

/** Throw 403 unless the user may read `relPath`. */
export function assertCanRead(user: AccessUser, relPath: string): void {
  if (!classifyAccess(user, relPath).canRead) {
    throw Errors.forbidden("You do not have access to this folder");
  }
}

/** Throw 403 unless the user may write `relPath` directly (manager+). */
export function assertCanWrite(user: AccessUser, relPath: string): void {
  if (!classifyAccess(user, relPath).canWrite) {
    throw Errors.forbidden("You are not allowed to modify this folder");
  }
}
