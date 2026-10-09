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
  /** Dashboards the shared report couldn't go into (busy or failed). */
  notImportedInto?: string[];
}

/** Vercel cuts request bodies at ~4.5 MB before they reach apps/api, so
 * files above this go straight into Convex storage (`uploadLarge`). */
const DIRECT_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;

/** Largest report accepted at all (matches apps/api and Convex). */
export const MAX_REPORT_UPLOAD_BYTES = 25 * 1024 * 1024;

export const UPLOAD_TOO_LARGE_MESSAGE =
  "Die Datei ist größer als 25 MB und kann nicht hochgeladen werden. Bitte den Export auf weniger Spalten oder einen kürzeren Zeitraum beschränken oder als .xlsx speichern (deutlich kleiner als .csv).";

// A request that dies without any response is either a dropped connection
// or a server-side timeout whose error page carries no CORS headers — the
// browser can't tell the two apart, so the message names both.
const NO_RESPONSE_MESSAGE =
  "Keine Antwort vom Server – entweder ist die Internetverbindung weg oder die Verarbeitung hat zu lange gedauert (sehr großer Report). Bitte Verbindung prüfen und erneut versuchen; große Reports vorher in Salesforce filtern. Taucht die Datei kurz danach in der Upload-Liste auf, ist sie trotzdem angekommen.";

const TIMEOUT_MESSAGE =
  "Die Verarbeitung hat zu lange gedauert und wurde abgebrochen. Bitte den Report in Salesforce filtern (z. B. nur aktueller und letzter Monat oder offene Leads) bzw. weniger Spalten exportieren und neu hochladen.";

/** What the uploader is told for a failed request: the server's own German
 * message when there is one, else an explanation by HTTP status. */
function failureMessage(res: { status: number; body: Record<string, unknown> } | null): string {
  if (!res) return NO_RESPONSE_MESSAGE;
  const own = errorMessage(res.body.error) ?? errorMessage(res.body);
  if (own) return own;
  switch (res.status) {
    case 401:
      return "Nicht mehr angemeldet. Bitte die Seite neu laden und erneut hochladen.";
    case 403:
      return "Keine Berechtigung für Uploads auf diesem Dashboard (nur Admins).";
    case 413:
      return UPLOAD_TOO_LARGE_MESSAGE;
    case 429:
      return "Zu viele Uploads in kurzer Zeit. Bitte ein paar Minuten warten und erneut versuchen.";
    case 502:
    case 503:
    case 504:
      return TIMEOUT_MESSAGE;
    default:
      return `Upload fehlgeschlagen (Server-Antwort ${res.status}). Bitte erneut versuchen; wenn es wieder passiert, der IT Dateiname und Uhrzeit schicken.`;
  }
}

/** POSTs `body` with XHR (for upload progress) and resolves with status and
 * parsed JSON body (empty object when it isn't JSON). */
function xhrPost(
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Headers | Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (headers instanceof Headers)
      headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    else for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        // Non-JSON error body (e.g. a proxy error page).
      }
      resolve({ status: xhr.status, body: parsed });
    };
    xhr.onerror = () => resolve(null);
    xhr.send(body);
  });
}

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
  return useMemo(() => {
    const performanceApi = {
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
        if (file.size > DIRECT_UPLOAD_THRESHOLD_BYTES) {
          return performanceApi.uploadLarge(file, options);
        }
        const form = new FormData();
        form.append("file", file);
        form.append("companyId", options.companyId);
        if (options.force) form.append("force", "true");
        if (options.batchId) form.append("batchId", options.batchId);
        const headers = await client.headers();
        const res = await xhrPost(
          `${apiBaseUrl}/performance/uploads`,
          form,
          headers,
          options.onProgress,
        );
        if (!res || res.status < 200 || res.status >= 300) {
          return { ok: false, error: failureMessage(res) };
        }
        return { ok: true, ...(res.body as Partial<UploadReportResult>) };
      },

      /** Files over ~4 MB: ticket from apps/api, upload straight into Convex
       * storage (with progress), then apps/api imports the stored file. */
      async uploadLarge(file: File, options: UploadReportOptions): Promise<UploadReportResult> {
        const fail = (res: { status: number; body: Record<string, unknown> } | null) => ({
          ok: false as const,
          error: failureMessage(res),
        });
        const headers = await client.headers();
        const json = {
          ...Object.fromEntries(headers.entries()),
          "content-type": "application/json",
        };

        const ticketRes = await xhrPost(
          `${apiBaseUrl}/performance/uploads/ticket`,
          JSON.stringify({ companyId: options.companyId, filename: file.name, size: file.size }),
          json,
        );
        if (!ticketRes || ticketRes.status < 200 || ticketRes.status >= 300) return fail(ticketRes);
        const { ticketId, uploadUrl } = ticketRes.body as { ticketId: string; uploadUrl: string };

        const stored = await xhrPost(
          uploadUrl,
          file,
          { "content-type": file.type || "application/octet-stream" },
          options.onProgress,
        );
        if (!stored || stored.status < 200 || stored.status >= 300) return fail(stored);
        const { storageId } = stored.body as { storageId: string };
        options.onProgress?.(1);

        const done = await xhrPost(
          `${apiBaseUrl}/performance/uploads/stored`,
          JSON.stringify({
            companyId: options.companyId,
            ticketId,
            storageId,
            filename: file.name,
            force: options.force ?? false,
            batchId: options.batchId,
          }),
          json,
        );
        if (!done || done.status < 200 || done.status >= 300) return fail(done);
        return { ok: true, ...(done.body as Partial<UploadReportResult>) };
      },
    };
    return performanceApi;
  }, [client]);
}
