/**
 * Convex → apps/api calls (its `/internal/*` routes). Resolves to null when
 * this deployment isn't wired to the API, e.g. local dev without it running —
 * each caller decides whether that's a skip or an error. Sends a JSON POST
 * when `body` is given, a plain GET otherwise.
 */
export async function internalApiFetch(path: string, body?: unknown): Promise<Response | null> {
  const baseUrl = process.env.API_INTERNAL_URL ?? process.env.API_URL;
  const serverKey = process.env.CONVEX_SERVER_KEY;
  if (!baseUrl || !serverKey) return null;
  if (body === undefined) {
    return fetch(`${baseUrl}${path}`, { headers: { "x-convex-server-key": serverKey } });
  }
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-convex-server-key": serverKey },
    body: JSON.stringify(body),
  });
}
