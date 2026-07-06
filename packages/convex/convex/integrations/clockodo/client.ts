import { ConvexError } from "convex/values";

/**
 * Low-level authenticated Clockodo HTTP client, shared by every
 * `integrations/clockodo/*` action. Kept independent from
 * `activity/clockodo.ts` (the read-only ActivityTrack poller's own client) —
 * duplicating a small header-building helper is cheaper than coupling
 * admin-triggered writes to the code path that keeps live presence polling
 * running, matching how `apps/api/src/lib/clockodo.ts` already duplicates
 * the same headers independently for its own concern.
 */

const CLOCKODO_BASE = () =>
  process.env.CLOCKODO_BASE_URL ?? "https://my.clockodo.com";

function clockodoHeaders(): Record<string, string> {
  const apiUser = process.env.CLOCKODO_API_USER;
  const apiKey = process.env.CLOCKODO_API_KEY;
  if (!apiUser || !apiKey) {
    throw new Error("CLOCKODO_API_USER / CLOCKODO_API_KEY not configured");
  }
  return {
    "X-ClockodoApiUser": apiUser,
    "X-ClockodoApiKey": apiKey,
    "X-Clockodo-External-Application":
      process.env.CLOCKODO_EXTERNAL_APP ?? "AdvantisIntranet",
    "Content-Type": "application/json",
  };
}

export type ClockodoMethod = "GET" | "POST" | "PUT" | "PATCH";

/** Best-effort extraction of a human-readable message from Clockodo's error
 * body, which isn't consistently shaped across endpoints/versions. */
function extractErrorDetail(text: string): string {
  try {
    const body = JSON.parse(text) as {
      message?: string;
      error?: { message?: string } | string;
    };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
    if (body.error && typeof body.error.message === "string") {
      return body.error.message;
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return text;
}

/**
 * Generic authenticated request. Clockodo's request/response bodies use
 * snake_case field names (confirmed via the existing absences client) —
 * callers build/read snake_case payloads and translate at the action
 * boundary.
 *
 * Failures throw `ConvexError({ code, message })` (not a plain `Error`) with
 * Clockodo's own error text attached — Convex only forwards `ConvexError`
 * data to the client, so a plain `Error` here would reach the manager as a
 * generic "Server Error" with no indication of *why* (e.g. a seat/license
 * limit, a permission issue, a bad field) even though Clockodo told us.
 */
export async function clockodoFetch<T>(
  path: string,
  init?: { method?: ClockodoMethod; body?: unknown }
): Promise<T> {
  const res = await fetch(`${CLOCKODO_BASE()}${path}`, {
    method: init?.method ?? "GET",
    headers: clockodoHeaders(),
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    const detail = extractErrorDetail(text);
    if (res.status === 429) {
      throw new ConvexError({
        code: "clockodo.rateLimited",
        message: "Clockodo is rate-limiting requests — try again shortly.",
      });
    }
    // Seat/license limits, permission errors, bad fields, etc. all land here
    // with whatever Clockodo actually said, rather than a masked generic
    // failure — that message is often the only actionable information (e.g.
    // "user limit reached, upgrade your plan or free a seat").
    throw new ConvexError({
      code: "clockodo.upstream",
      message: detail || `Clockodo request failed (${res.status})`,
    });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
