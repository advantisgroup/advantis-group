"use client";

import { useCallback, useMemo } from "react";

import {
  type DriveQuota,
  type MessageAttachment,
  type OneDriveItem,
  type OneDriveListing,
  type ScanReport,
} from "@advantis/types";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";

import { downloadWithProgress, fetchAsFile } from "@/lib/download";

/**
 * Typed client for the OneDrive endpoints on the Advantis API. Cross-origin
 * requests can't rely on the Clerk cookie, so every call carries the session
 * token as a Bearer header (same approach as the wiki-chat / chat callers).
 */

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3002";

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = "Something went wrong";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

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

export function useOneDriveApi() {
  const { getToken } = useAuth();
  const t = useTranslations("Files");

  const authHeaders = useCallback(
    async (extra?: Record<string, string>): Promise<Record<string, string>> => {
      const token = await getToken();
      return {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...extra,
      };
    },
    [getToken]
  );

  return useMemo(() => {
    const get = async <T>(path: string): Promise<T> =>
      parse<T>(await fetch(`${API}${path}`, { headers: await authHeaders() }));

    const send = async <T>(
      method: string,
      path: string,
      body?: unknown
    ): Promise<T> =>
      parse<T>(
        await fetch(`${API}${path}`, {
          method,
          headers: await authHeaders(
            body ? { "content-type": "application/json" } : undefined
          ),
          body: body ? JSON.stringify(body) : undefined,
        })
      );

    return {
      status: () => get<{ configured: boolean }>("/onedrive/status"),

      list: (path: string) =>
        get<OneDriveListing>(
          `/onedrive/items?path=${encodeURIComponent(path)}`
        ),

      quota: () => get<DriveQuota>("/onedrive/quota"),

      search: (q: string) =>
        get<{ items: OneDriveItem[] }>(
          `/onedrive/search?q=${encodeURIComponent(q)}`
        ),

      preview: (id: string) =>
        get<{ previewUrl?: string; thumbnailUrl?: string }>(
          `/onedrive/preview/${encodeURIComponent(id)}`
        ),

      download: async (id: string, name: string): Promise<void> => {
        await downloadWithProgress(
          `${API}/onedrive/download/${encodeURIComponent(id)}`,
          name,
          t("downloading"),
          { headers: await authHeaders() }
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
          `${API}/onedrive/download/${encodeURIComponent(item.id)}`,
          item.name,
          item.mimeType,
          { headers: await authHeaders() }
        ),

      /**
       * Import a drive file straight into Convex storage server-side (Graph
       * -> API -> Convex), skipping the browser download-then-reupload round
       * trip `downloadAsFile` needs. Returns a ready-to-use attachment.
       */
      importAttachment: (item: { id: string }) =>
        send<MessageAttachment>(
          "POST",
          `/onedrive/import/${encodeURIComponent(item.id)}`
        ),

      /** Upload via XHR so the rocket animation can track real progress. */
      upload: (
        file: File,
        path: string,
        onProgress?: (fraction: number) => void
      ): Promise<UploadResult> =>
        new Promise<UploadResult>((resolve, reject) => {
          void (async () => {
            const token = await getToken();
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${API}/onedrive/uploads`);
            if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
            xhr.upload.onprogress = e => {
              if (e.lengthComputable && onProgress) {
                onProgress(e.loaded / e.total);
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText) as UploadResult);
              } else {
                let message = "Upload failed";
                try {
                  message =
                    (JSON.parse(xhr.responseText) as { error?: string })
                      .error ?? message;
                } catch {
                  // keep generic
                }
                reject(new Error(message));
              }
            };
            xhr.onerror = () => reject(new Error("Upload failed"));
            const form = new FormData();
            form.append("file", file);
            form.append("path", path);
            xhr.send(form);
          })();
        }),

      approve: (uploadId: string, note?: string) =>
        send<{ ok: true }>(
          "POST",
          `/onedrive/uploads/${encodeURIComponent(uploadId)}/approve`,
          note ? { note } : {}
        ),

      deny: (uploadId: string, note?: string) =>
        send<{ ok: true }>(
          "POST",
          `/onedrive/uploads/${encodeURIComponent(uploadId)}/deny`,
          note ? { note } : {}
        ),

      createFolder: (path: string, name: string) =>
        send<{ id: string; name: string }>("POST", "/onedrive/folders", {
          path,
          name,
        }),

      rename: (id: string, name: string) =>
        send<{ id: string; name: string }>(
          "PATCH",
          `/onedrive/items/${encodeURIComponent(id)}`,
          { name }
        ),

      move: (id: string, destPath: string) =>
        send<{ id: string; name: string }>(
          "PATCH",
          `/onedrive/items/${encodeURIComponent(id)}`,
          { destPath }
        ),

      remove: (id: string) =>
        send<{ ok: true }>(
          "DELETE",
          `/onedrive/items/${encodeURIComponent(id)}`
        ),

      versions: (id: string) =>
        get<{ versions: OneDriveVersion[] }>(
          `/onedrive/items/${encodeURIComponent(id)}/versions`
        ),

      restoreVersion: (id: string, versionId: string) =>
        send<{ ok: true }>(
          "POST",
          `/onedrive/items/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`
        ),

      share: (id: string, expiresInDays: number) =>
        send<{ url: string; expiresAt: string }>(
          "POST",
          `/onedrive/items/${encodeURIComponent(id)}/share`,
          { expiresInDays }
        ),

      teamAccessRoster: () =>
        get<{ users: TeamAccessRow[] }>("/onedrive/team-access"),

      grantTeamAccess: (userId: string, email: string) =>
        send<{ ok: true; alreadyHadAccess: boolean; roles?: string[] }>(
          "POST",
          "/onedrive/team-access/grant",
          { userId, email }
        ),

      revokeTeamAccess: (userId: string, permissionId: string) =>
        send<{ ok: true }>("POST", "/onedrive/team-access/revoke", {
          userId,
          permissionId,
        }),

      syncTeamAccess: () =>
        send<{ granted: number; alreadyHadAccess: number; skipped: number }>(
          "POST",
          "/onedrive/team-access/sync"
        ),
    };
  }, [authHeaders, getToken, t]);
}

export type OneDriveApi = ReturnType<typeof useOneDriveApi>;
