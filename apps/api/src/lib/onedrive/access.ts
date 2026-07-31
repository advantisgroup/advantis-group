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
  /** Full general-purpose file browser access (manager+, or the `access_files` capability). */
  canAccessFiles?: boolean;
  /** Indirect, scope-only write grant: holding `manage_guidebooks` lets an
   * otherwise-non-manager editor write inside Team/Wiki (and nowhere else),
   * since wiki attachments are OneDrive-backed. */
  canWriteWiki?: boolean;
  /** Same idea as `canWriteWiki`, scoped to Team/HR — granted by Applicant
   * Management access, for employee documents living in OneDrive. */
  canWriteHR?: boolean;
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
    .map((seg) => seg.trim())
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

const isManagerRole = (role: Role): boolean => role === "admin" || role === "manager";

/** Team/Wiki and Team/HR, relative to the AG root. */
export function wikiFolderBase(): string {
  return `${folderConfig().team}/Wiki`;
}
export function hrFolderBase(): string {
  return `${folderConfig().team}/HR`;
}

/** Whether `relPath` (already normalized) falls inside the wiki/HR indirect
 * write grant for `user` — i.e. they hold the domain capability and the path
 * is within *only* their own subtree, never any other Team folder. */
function scopedWriteGrant(user: AccessUser, path: string): boolean {
  return (
    (user.canWriteWiki === true && isWithin(path, wikiFolderBase())) ||
    (user.canWriteHR === true && isWithin(path, hrFolderBase()))
  );
}

/**
 * Effective permissions for `user` on the AG-relative `relPath`. The single
 * decision point — routes must call this and never trust client-supplied flags.
 */
export function classifyAccess(user: AccessUser, relPath: string): AccessResult {
  const zone = zoneOf(relPath);
  const manager = isManagerRole(user.role);
  const uploadAllowed = user.uploadRequestsEnabled !== false;
  const path = normalizePath(relPath);

  let canRead = false;
  switch (zone) {
    case "root":
    case "team":
      // Team-zone read is intentionally universal for any active user (not
      // gated by `canAccessFiles`) — wiki/HR attachments rely on that for
      // every viewer's download/preview to work with zero extra grants.
      // `canAccessFiles` (or the wiki/HR scope below) instead gates whether
      // a user may *browse* the zone via the listing routes — see
      // `requireFileBrowserAccess` and the explicit confinement check those
      // routes apply on top of this.
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

  // Indirect permission: holding the wiki/HR domain capability grants write
  // access strictly within that one subtree, independent of role — a
  // non-manager wiki editor can create folders under Team/Wiki, but nowhere
  // else in Team, and the same for an HR user under Team/HR.
  const canWrite = (canRead && manager) || scopedWriteGrant(user, path);
  const canRequest = canRead && !canWrite && uploadAllowed;

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

/**
 * `canRead` is deliberately universal across the whole Team zone (see
 * `classifyAccess`), so it can't be used to confine *browsing* to a subtree.
 * A user admitted into the listing/search routes only via the wiki/HR
 * indirect grant (not general `canAccessFiles`) must still be limited to
 * their own subtree there. Always true for anyone with full file-browser access.
 */
export function isWithinBrowsableScope(user: AccessUser, relPath: string): boolean {
  if (user.canAccessFiles) return true;
  return scopedWriteGrant(user, normalizePath(relPath));
}

/** Throw variant of `isWithinBrowsableScope`, for routes that list a single
 * explicit folder (as opposed to filtering a result set from it). */
export function assertWithinBrowsableScope(user: AccessUser, relPath: string): void {
  if (!isWithinBrowsableScope(user, relPath)) {
    throw Errors.forbidden("You do not have access to this folder");
  }
}
