/**
 * Local copy of the @advantis/types definitions that apps/api depends on.
 *
 * WHY not import @advantis/types directly: that package ships raw TypeScript
 * source (`./src/index.ts`, no JS build). Vercel's Elysia deploy runs on Node,
 * which cannot execute a workspace `.ts` file at runtime — its file tracer
 * leaves the package out of the bundle, so `autoProfil` (the one runtime value
 * the API pulls from it) crashes every route on cold start with
 * ERR_MODULE_NOT_FOUND. Keeping these here severs that runtime dependency while
 * `@advantis/types` stays the shared source of truth for the intranet.
 */

export type Role = "admin" | "manager" | "employee";

export interface DriveQuota {
  used: number;
  total: number;
  remaining: number;
}

export type ScanVerdict = "clean" | "suspicious" | "blocked";
export type ScanSeverity = "info" | "warning" | "danger";

export interface ScanFlag {
  code: string;
  severity: ScanSeverity;
  detail: string;
}

export interface ScanReport {
  verdict: ScanVerdict;
  flags: ScanFlag[];
  scannedAt: number;
}

export type NotificationEmailKind =
  | "invite"
  | "access-approved"
  | "access-denied"
  | "absence-decision"
  | "upload-decision"
  | "chat-reinvite"
  | "digest"
  | "academy-invite";

export interface UnfurlResult {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export type OneDriveItemType = "folder" | "file";

export interface OneDriveItem {
  id: string;
  name: string;
  type: OneDriveItemType;
  size: number;
  lastModified?: string;
  mimeType?: string;
  childCount?: number;
  path: string;
  canWrite: boolean;
  thumbnailUrl?: string;
  uploadedByName?: string;
}

export interface OneDriveBreadcrumb {
  id: string;
  name: string;
  path: string;
}

export interface OneDriveListing {
  folderId: string;
  path: string;
  breadcrumbs: OneDriveBreadcrumb[];
  items: OneDriveItem[];
  canWrite: boolean;
  canRequest: boolean;
  previewItem?: OneDriveItem;
}

export interface ApplicantSkillProfile {
  id: string;
  name: string;
  skills: string[];
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
