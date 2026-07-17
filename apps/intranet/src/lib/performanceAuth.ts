// Client-side helpers for the Performance feature's session token. This is a
// temporary, non-Clerk auth bridge (see `performanceAuth.ts`); the token is
// bearer-style and admin-revocable, so a non-httpOnly cookie is acceptable
// here, same as the guest tour token (`lib/guest.ts`).
const COOKIE = "performance_token";

export function getPerformanceToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find(row => row.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export function setPerformanceToken(token: string, expiresAt: number): void {
  if (typeof document === "undefined") return;
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  document.cookie = `${COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function clearPerformanceToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
}

// Remembers the last month picked on the team dashboard/employee detail
// pages, so navigating between them (or reloading) doesn't silently reset
// back to the current month. Purely a UX convenience — every page still
// falls back to the server's current-month default when nothing is stored.
const LAST_YM_KEY = "performance_last_ym";

export function getLastPerformanceYm(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(LAST_YM_KEY) ?? undefined;
}

export function setLastPerformanceYm(ym: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_YM_KEY, ym);
}

// Tracks a "Not now" dismissal of the self-service Clerk-link prompt, keyed
// per login so dismissing it while testing one account doesn't hide it for
// another login tried later in the same browser. Not synced anywhere —
// worst case a re-dismissed prompt reappears once on a new device/browser.
const LINK_PROMPT_DISMISSED_PREFIX = "performance_link_prompt_dismissed_";

export function isLinkPromptDismissed(loginId: string): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(LINK_PROMPT_DISMISSED_PREFIX + loginId) === "1"
  );
}

export function dismissLinkPrompt(loginId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LINK_PROMPT_DISMISSED_PREFIX + loginId, "1");
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3002";

/** Downloads an authenticated apps/api file response via a blob + object
 * URL — a plain `<a href>` can't carry the bearer token. */
export async function downloadPerformanceFile(
  path: string,
  token: string,
  filename: string
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface UploadReportResult {
  ok: boolean;
  status?: "ok" | "empty" | "duplicate";
  error?: string;
  rowsImported?: number;
  skipped?: string[];
  // Only set when status is "duplicate" — the earlier upload this file's
  // content matches.
  filename?: string;
  uploadedAt?: number;
}

/** Uploads one report file to `POST /performance/uploads`, reporting real
 * upload progress (0–1) — uses XHR rather than `fetch` since `fetch` has no
 * upload-progress event, matching the pattern already proven by
 * `uploadToConvex` in `lib/upload.ts`. `onProgress` fires only for the
 * client→server transfer; parsing/import happens after it reaches 1. */
export function uploadPerformanceReport(
  file: File,
  token: string,
  onProgress?: (fraction: number) => void
): Promise<UploadReportResult> {
  return new Promise(resolve => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/performance/uploads`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: Partial<UploadReportResult> = {};
      try {
        body = JSON.parse(xhr.responseText) as Partial<UploadReportResult>;
      } catch {
        // Non-JSON error body (e.g. a proxy error page) — fall through to
        // the generic ok:false below.
      }
      resolve(
        xhr.status >= 200 && xhr.status < 300
          ? { ok: true, ...body }
          : { ok: false, error: body.error }
      );
    };
    xhr.onerror = () => resolve({ ok: false });
    xhr.send(form);
  });
}
