import { ConvexHttpClient } from "convex/browser";

/**
 * Server-side Convex access for the API routes. Marketing's Convex functions
 * only accept calls carrying the server key, so the browser can't reach them
 * directly — set CONVEX_SERVER_KEY (same value as apps/api and Convex itself).
 */
export const convex = process.env.NEXT_PUBLIC_CONVEX_URL
  ? new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
  : null;

export function serverKey(): string {
  const key = process.env.CONVEX_SERVER_KEY;
  if (!key) throw new Error("CONVEX_SERVER_KEY is not set");
  return key;
}
