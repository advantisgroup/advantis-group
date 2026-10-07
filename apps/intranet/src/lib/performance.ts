"use client";

import { useMemo } from "react";

import { type Id } from "@advantis/convex/dataModel";

import { useIntranetApiClient } from "@/lib/api-client";
import { apiBaseUrl } from "@/lib/eden";

// Remembers the last month picked on the team dashboard/employee detail
// pages, so navigating between them (or reloading) doesn't silently reset
// back to the current month. Purely a UX convenience — every page still
// falls back to the server's current-month default when nothing is stored.
const LAST_YM_KEY = "performance_last_ym";

export function getLastPerformanceYm(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(LAST_YM_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setLastPerformanceYm(ym: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_YM_KEY, ym);
  } catch {
    // Not persisted — harmless.
  }
}

export type PerformanceReportKind =
  | "lead"
  | "opp"
  | "call"
  | "template"
  | "interactions"
  | "wallbox_members"
  | "wallbox_opps";

export interface UploadReportResult {
  ok: boolean;
  status?: "ok" | "empty" | "duplicate";
  error?: string;
  rowsImported?: number;
  skipped?: string[];
  // Rows whose duration failed the plausibility check on import — see
  // `performanceFlaggedRows` in the Convex schema. Surfaced so the upload
  // page can tell the admin this specific upload needs review.
  flagged?: number;
  // Only set when status is "duplicate" — the earlier upload this file's
  // content matches.
  filename?: string;
  uploadedAt?: number;
  // What the file was detected as, and the day(s) it was filed under.
  reportKind?: PerformanceReportKind;
  reportDate?: string;
  reportDateFrom?: string;
  // The drill-down lists were kept because they already hold this newer
  // report date.
  rawKept?: string;
  // Other dashboards a shared call/interactions report also went into.
  alsoImportedInto?: string[];
}

/** Vercel cuts request bodies at ~4.5 MB before they reach apps/api. */
export const MAX_REPORT_UPLOAD_BYTES = 4 * 1024 * 1024;

export const UPLOAD_TOO_LARGE_MESSAGE =
  "Die Datei ist größer als 4 MB und kann nicht hochgeladen werden. Bitte den Export auf weniger Spalten oder einen kürzeren Zeitraum beschränken oder als .xlsx speichern (deutlich kleiner als .csv).";

export interface UploadReportOptions {
  companyId: Id<"companies">;
  onProgress?: (fraction: number) => void;
  // Re-import despite a content-hash match against a prior upload.
  force?: boolean;
  // Shared by every file selected/dropped together, so the upload log can
  // show them as one batch instead of unrelated same-timestamp rows.
  batchId?: string;
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

/** Report upload and file downloads through apps/api, signed in with the
 * intranet (Clerk) session like every other intranet API call. */
export function usePerformanceApi() {
  const client = useIntranetApiClient();
  return useMemo(
    () => ({
      async download(path: string, filename: string): Promise<void> {
        const blob = await client.fetchBlob(path);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },

      /** Uploads one report file to `POST /performance/uploads`, reporting
       * upload progress (0–1). Parsing/import happens after it reaches 1.
       * Plain XHR (not `client.uploadForm`) so the parser's own error text
       * ("Spalte … nicht gefunden") reaches the upload queue. */
      async uploadReport(file: File, options: UploadReportOptions): Promise<UploadReportResult> {
        if (file.size > MAX_REPORT_UPLOAD_BYTES) {
          return { ok: false, error: UPLOAD_TOO_LARGE_MESSAGE };
        }
        const form = new FormData();
        form.append("file", file);
        form.append("companyId", options.companyId);
        if (options.force) form.append("force", "true");
        if (options.batchId) form.append("batchId", options.batchId);
        const headers = await client.headers();
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${apiBaseUrl}/performance/uploads`);
          headers.forEach((value, key) => xhr.setRequestHeader(key, value));
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) options.onProgress?.(e.loaded / e.total);
          };
          xhr.onload = () => {
            let body: Record<string, unknown> = {};
            try {
              body = JSON.parse(xhr.responseText) as Record<string, unknown>;
            } catch {
              // Non-JSON error body (e.g. a proxy error page).
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ ok: true, ...(body as Partial<UploadReportResult>) });
            } else if (xhr.status === 413) {
              resolve({ ok: false, error: UPLOAD_TOO_LARGE_MESSAGE });
            } else {
              // apps/api's envelope is `{ error, code, requestId }`; `error`
              // carries the parser's German message.
              resolve({ ok: false, error: errorMessage(body.error) ?? errorMessage(body) });
            }
          };
          xhr.onerror = () =>
            resolve({
              ok: false,
              error:
                "Keine Verbindung zum Server. Bitte Internetverbindung prüfen und erneut versuchen.",
            });
          xhr.send(form);
        });
      },
    }),
    [client],
  );
}
