import { ConvexHttpClient } from "convex/browser";

import { requireEnv } from "./env";

let client: ConvexHttpClient | null = null;

/** Shared Convex HTTP client (server-side). */
export function getConvex(): ConvexHttpClient {
  if (!client) {
    const url =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("CONVEX_URL / NEXT_PUBLIC_CONVEX_URL not set");
    client = new ConvexHttpClient(url);
  }
  return client;
}

/** Shared server key used to authorize server-key-gated Convex mutations. */
export function getConvexServerKey(): string {
  return requireEnv("CONVEX_SERVER_KEY");
}
