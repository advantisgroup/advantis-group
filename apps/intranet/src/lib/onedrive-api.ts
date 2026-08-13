"use client";

import { useMemo } from "react";

import {
  type DriveQuota,
  type MessageAttachment,
  type OneDriveItem,
  type OneDriveListing,
  type ScanReport,
} from "@advantis/types";
import { useTranslations } from "next-intl";

import { type IntranetApiClient, useIntranetApiClient } from "@/lib/api-client";
import { downloadWithProgress, fetchAsFile } from "@/lib/download";
import { apiBaseUrl } from "@/lib/eden";

/**
 * Typed client for the OneDrive endpoints on the Advantis API. Cross-origin
 * requests can't rely on the Clerk cookie, so every call carries the session
 * token as a Bearer header (same approach as the wiki-chat / chat callers).
 */

export interface UploadResult {
  status: "uploaded" | "pending";
  uploadId?: string;
  scan: ScanReport;
}

export interface OneDriveVersion {
  id: string;
  size: number;
  lastModified?: string;
  modifiedBy?: string;
}

export interface TeamAccessRow {
  userId: string;
  name: string;
  email: string;
  permissionId: string | null;
}

export interface WikiAttachmentUpload {
  oneDriveItemId: string;
  oneDrivePath: string;
  name: string;
  size: number;
  contentType: string;
  kind: "image" | "file";
}

/** Shared XHR upload for the wiki/HR "attach" endpoints (multipart, optional
 * subfolder, real progress via XHR rather than fetch). */
function uploadToAttachEndpoint(
  api: IntranetApiClient,
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
  folder?: string,
): Promise<WikiAttachmentUpload> {
  const form = new FormData();
  form.append("file", file);
  if (folder) form.append("folder", folder);
  return api.uploadForm<WikiAttachmentUpload>(path, form, onProgress);
}

export function useOneDriveApi() {
  const api = useIntranetApiClient();
  const t = useTranslations("Files");

  return useMemo(() => {
    const get = async <T>(path: string): Promise<T> => api.fetchJson<T>(path);

    const send = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
      api.fetchJson<T>(path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

    return {
      status: () => get<{ configured: boolean }>("/onedrive/status"),

      list: (path: string) =>
        get<OneDriveListing>(`/onedrive/items?path=${encodeURIComponent(path)}`),

      quota: () => get<DriveQuota>("/onedrive/quota"),

      search: (q: string) =>
        get<{ items: OneDriveItem[] }>(`/onedrive/search?q=${encodeURIComponent(q)}`),

      preview: (id: string) =>
        get<{ previewUrl?: string; thumbnailUrl?: string }>(
          `/onedrive/preview/${encodeURIComponent(id)}`,
        ),

      download: async (id: string, name: string): Promise<void> => {
        await downloadWithProgress(
          `${apiBaseUrl}/onedrive/download/${encodeURIComponent(id)}`,
          name,
          t("downloading"),
          { headers: await api.headers() },
        );
      },

      /**
       * Pull a drive file's bytes back as a `File`, so it can be dropped
       * straight into any feature that already accepts local uploads
       * (announcements, chat, …) without a separate attachment code path.
       */
      downloadAsFile: async (item: {
        id: string;
        name: string;
        mimeType?: string;
      }): Promise<File> =>
        fetchAsFile(
          `${apiBaseUrl}/onedrive/download/${encodeURIComponent(item.id)}`,
          item.name,
          item.mimeType,
          { headers: await api.headers() },
        ),

      /**
       * Import a drive file straight into Convex storage server-side (Graph
       * -> API -> Convex), skipping the browser download-then-reupload round
       * trip `downloadAsFile` needs. Returns a ready-to-use attachment.
       */
      importAttachment: (item: { id: string }) =>
        send<MessageAttachment>("POST", `/onedrive/import/${encodeURIComponent(item.id)}`),

      /** Upload via XHR so the rocket animation can track real progress. */
      upload: (
        file: File,
        path: string,
        onProgress?: (fraction: number) => void,
      ): Promise<UploadResult> => {
        const form = new FormData();
        form.append("file", file);
        form.append("path", path);
        return api.uploadForm<UploadResult>("/onedrive/uploads", form, onProgress);
      },

      /**
       * Upload a guidebook (wiki) attachment straight to OneDrive
       * (Team/Wiki/<slug>/…, auto-provisioned server-side). Returns the
       * reference Convex stores — never the bytes — so the file's single
       * source of truth is OneDrive and everyone with wiki access already
       * has Team-zone read access to it as a backup. XHR (not fetch) so
       * `onProgress` can track real upload progress, same as `upload()` above.
       */
      attachToWiki: (
        slug: string,
        file: File,
        onProgress?: (fraction: number) => void,
        folder?: string,
      ): Promise<WikiAttachmentUpload> =>
        uploadToAttachEndpoint(
          api,
          `/onedrive/wiki/${encodeURIComponent(slug)}/attach`,
          file,
          onProgress,
          folder,
        ),

      /** Same shape as `attachToWiki`, for an employee's HR document folder
       * (Team/HR/<employee>/…, auto-provisioned server-side). */
      attachToHR: (
        employeeProfileId: string,
        file: File,
        onProgress?: (fraction: number) => void,
        folder?: string,
      ): Promise<WikiAttachmentUpload> =>
        uploadToAttachEndpoint(
          api,
          `/onedrive/hr/${encodeURIComponent(employeeProfileId)}/attach`,
          file,
          onProgress,
          folder,
        ),

      approve: (uploadId: string, note?: string) =>
        send<{ ok: true }>(
          "POST",
          `/onedrive/uploads/${encodeURIComponent(uploadId)}/approve`,
          note ? { note } : {},
        ),

      deny: (uploadId: string, note?: string) =>
        send<{ ok: true }>(
          "POST",
          `/onedrive/uploads/${encodeURIComponent(uploadId)}/deny`,
          note ? { note } : {},
        ),

      createFolder: (path: string, name: string) =>
        send<{ id: string; name: string }>("POST", "/onedrive/folders", {
          path,
          name,
        }),

      rename: (id: string, name: string) =>
        send<{ id: string; name: string }>("PATCH", `/onedrive/items/${encodeURIComponent(id)}`, {
          name,
        }),

      move: (id: string, destPath: string) =>
        send<{ id: string; name: string }>("PATCH", `/onedrive/items/${encodeURIComponent(id)}`, {
          destPath,
        }),

      remove: (id: string) =>
        send<{ ok: true }>("DELETE", `/onedrive/items/${encodeURIComponent(id)}`),

      versions: (id: string) =>
        get<{ versions: OneDriveVersion[] }>(`/onedrive/items/${encodeURIComponent(id)}/versions`),

      restoreVersion: (id: string, versionId: string) =>
        send<{ ok: true }>(
          "POST",
          `/onedrive/items/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`,
        ),

      share: (id: string, expiresInDays: number) =>
        send<{ url: string; expiresAt: string }>(
          "POST",
          `/onedrive/items/${encodeURIComponent(id)}/share`,
          { expiresInDays },
        ),

      teamAccessRoster: () => get<{ users: TeamAccessRow[] }>("/onedrive/team-access"),

      grantTeamAccess: (userId: string, email: string) =>
        send<{ ok: true; alreadyHadAccess: boolean; roles?: string[] }>(
          "POST",
          "/onedrive/team-access/grant",
          { userId, email },
        ),

      revokeTeamAccess: (userId: string, permissionId: string) =>
        send<{ ok: true }>("POST", "/onedrive/team-access/revoke", {
          userId,
          permissionId,
        }),

      syncTeamAccess: () =>
        send<{ granted: number; alreadyHadAccess: number; skipped: number }>(
          "POST",
          "/onedrive/team-access/sync",
        ),
    };
  }, [api, t]);
}

export type OneDriveApi = ReturnType<typeof useOneDriveApi>;
