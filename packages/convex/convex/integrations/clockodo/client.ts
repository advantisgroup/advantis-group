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

/**
 * Generic authenticated request. Clockodo's request/response bodies use
 * snake_case field names (confirmed via the existing absences client) —
 * callers build/read snake_case payloads and translate at the action
 * boundary. The exact verb for *editing* a resource varies (users: PUT;
 * target-hours/holidays-quota: PATCH per the official SDK) — a 404/405 on a
 * first real call is the signal to double check the verb picked in
 * `users.ts` against a live account.
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
    throw new Error(
      `Clockodo ${init?.method ?? "GET"} ${path} failed: ${res.status} ${text}`
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
