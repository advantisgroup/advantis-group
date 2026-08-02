/**
 * Shared types used across the Advantis monorepo (intranet app + Elysia API +
 * Convex functions). Keep this framework-agnostic — no React/Next/Convex
 * runtime imports, types only.
 */

// ---------------------------------------------------------------------------
// Roles & access
// ---------------------------------------------------------------------------

export const ROLES = ["admin", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may manage access, invites, announcements, events and approvals. */
export const MANAGER_ROLES: readonly Role[] = ["admin", "manager"];

export function isManagerRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/**
 * Keys for globally disableable features, admin-toggled from
 * `/admin/feature-flags`. Adding a new one is a one-entry addition here plus
 * a registry entry in `packages/convex/convex/featureFlags.ts` — see that
 * file for how enforcement is wired up per feature.
 */
export const FEATURE_FLAG_KEYS = ["activitytrack", "chat"] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export function isAdminRole(role: Role | null | undefined): boolean {
  return role === "admin";
}

export type UserStatus = "active" | "suspended";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
export type AccessRequestStatus = "pending" | "approved" | "denied";

// ---------------------------------------------------------------------------
// Domain enums
// ---------------------------------------------------------------------------

export const ABSENCE_TYPES = ["vacation", "sick", "personal", "other"] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export type AbsenceStatus = "pending" | "approved" | "denied" | "cancelled";

export type ConversationType = "dm" | "group";

export type MessageAttachmentKind = "image" | "file";

export interface MessageAttachment {
  storageId: string;
  kind: MessageAttachmentKind;
  name: string;
  width?: number;
  height?: number;
  size?: number;
  contentType?: string;
  /** Present when imported from OneDrive — links the attachment back to its source. */
  oneDriveItemId?: string;
  oneDrivePath?: string;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// ---------------------------------------------------------------------------
// Elysia API contracts (api.advantisgroup.de)
// ---------------------------------------------------------------------------

/** Response shape for GET /unfurl?url= */
export interface UnfurlResult {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export type NotificationEmailKind =
  | "invite"
  | "access-approved"
  | "access-denied"
  | "absence-decision"
  | "upload-decision"
  | "chat-reinvite"
  | "digest";

/** Body for POST /internal/notifications (serverKey-gated, called by Convex). */
export interface InternalNotificationRequest {
  kind: NotificationEmailKind;
  to: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// OneDrive / file store (api.advantisgroup.de → Microsoft Graph)
//
// The intranet is the front page for a single OneDrive subscription. Access is
// enforced entirely in our API (Graph sees one all-powerful service account),
// so these DTOs already carry the viewer's effective permissions.
// ---------------------------------------------------------------------------

export type OneDriveItemType = "folder" | "file";

export interface OneDriveItem {
  id: string;
  name: string;
  type: OneDriveItemType;
  /** Size in bytes (folder = aggregate size reported by Graph). */
  size: number;
  /** ISO timestamp of the last modification. */
  lastModified?: string;
  /** MIME type for files. */
  mimeType?: string;
  /** Child count for folders. */
  childCount?: number;
  /** Path relative to the Advantis Group root, e.g. "Team/Reports". */
  path: string;
  /** Whether the current viewer may write here (upload/delete/rename/move). */
  canWrite: boolean;
  /** Thumbnail URL when Graph can render one (images / office / pdf). */
  thumbnailUrl?: string;
  /** Display name of the intranet user who uploaded this, when tracked. */
  uploadedByName?: string;
}

export interface OneDriveBreadcrumb {
  id: string;
  name: string;
  /** Path relative to the Advantis Group root. */
  path: string;
}

export interface OneDriveListing {
  folderId: string;
  /** Path relative to the Advantis Group root ("" for the root). */
  path: string;
  breadcrumbs: OneDriveBreadcrumb[];
  items: OneDriveItem[];
  /** Viewer may create folders / upload directly here (manager+). */
  canWrite: boolean;
  /** Viewer may submit an upload request here (employee, default-on flag). */
  canRequest: boolean;
  /**
   * Set when the requested path pointed at a file rather than a folder —
   * `items`/`path` describe the file's parent folder instead, and the
   * client should open a preview for this file after loading the listing.
   */
  previewItem?: OneDriveItem;
}

/** Drive storage usage, for the 1 TB quota bar. */
export interface DriveQuota {
  used: number;
  total: number;
  remaining: number;
}

export type ScanVerdict = "clean" | "suspicious" | "blocked";
export type ScanSeverity = "info" | "warning" | "danger";

export interface ScanFlag {
  /** Stable machine code, e.g. "blocked_extension", "extension_mismatch". */
  code: string;
  severity: ScanSeverity;
  /** Human-readable explanation for the reviewing manager. */
  detail: string;
}

export interface ScanReport {
  verdict: ScanVerdict;
  flags: ScanFlag[];
  scannedAt: number;
}

export type UploadStatus = "pending" | "approved" | "denied" | "uploading" | "failed" | "cancelled";

export const UPLOAD_AUDIT_ACTIONS = [
  "request",
  "approve",
  "deny",
  "upload",
  "delete",
  "mkdir",
  "rename",
  "move",
  "share",
  "restore",
] as const;

// ---------------------------------------------------------------------------
// Applicant Management (Bewerbermanagement) — skill matching
// ---------------------------------------------------------------------------

export interface ApplicantSkillProfile {
  id: string;
  name: string;
  skills: string[];
}

export interface ApplicantSkillMatchable {
  skills?: string[];
  zusammenfassung?: string | null;
  berufserfahrung?: string | null;
  ausbildung?: string | null;
  position?: string | null;
}

/** Skills from `profile` that show up (case-insensitively) in the applicant's data. */
export function matchSkills(profileSkills: string[], applicant: ApplicantSkillMatchable): string[] {
  const haystack = [
    ...(applicant.skills ?? []),
    applicant.zusammenfassung ?? "",
    applicant.berufserfahrung ?? "",
    applicant.position ?? "",
  ]
    .join(" • ")
    .toLowerCase();
  return profileSkills.filter((skill) => haystack.includes(skill.toLowerCase()));
}

/** Suggests a skill profile whose name matches the applicant's stated position. */
export function autoProfil(
  profiles: ApplicantSkillProfile[],
  positionText: string | null | undefined,
): string | null {
  if (!positionText) return null;
  const text = positionText.toLowerCase();
  const hit = profiles.find(
    (p) => text.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(text),
  );
  return hit ? hit.id : null;
}
export type UploadAuditAction = (typeof UPLOAD_AUDIT_ACTIONS)[number];
