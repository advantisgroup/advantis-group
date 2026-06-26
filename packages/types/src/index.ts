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

export const ABSENCE_TYPES = [
  "vacation",
  "sick",
  "personal",
  "other",
] as const;
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
  | "guest-invite"
  | "digest";

/** Body for POST /internal/notifications (serverKey-gated, called by Convex). */
export interface InternalNotificationRequest {
  kind: NotificationEmailKind;
  to: string;
  data: Record<string, unknown>;
}
