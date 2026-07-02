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
  | "guest-invite"
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

export type UploadStatus =
  | "pending"
  | "approved"
  | "denied"
  | "uploading"
  | "failed"
  | "cancelled";

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
export type UploadAuditAction = (typeof UPLOAD_AUDIT_ACTIONS)[number];
