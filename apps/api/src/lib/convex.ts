import { ConvexHttpClient } from "convex/browser";

import { CONVEX_PREVIEW_URL } from "./convexPreviewUrl.generated.js";
import { optionalEnv, requireEnv } from "./env.js";

let client: ConvexHttpClient | null = null;

/**
 * Shared Convex HTTP client (server-side). Falls back to
 * `CONVEX_PREVIEW_URL` when neither env var is set — that constant is
 * overwritten at build time by `scripts/vercel-preview-convex-api-build.sh`
 * on a Vercel Preview/Development build, with the same branch-scoped Convex
 * backend `apps/intranet`'s build resolves for that PR (see that script's
 * header comment for why this app needs a generated file instead of the
 * `NEXT_PUBLIC_*` build-time inlining the Next.js apps use — a plain server
 * has no client bundle to bake a value into). Unaffected outside Vercel
 * Preview: this stays empty everywhere else, so `CONVEX_URL`/
 * `NEXT_PUBLIC_CONVEX_URL` (dev, and Vercel's static Production values)
 * behave exactly as before.
 */
export function getConvex(): ConvexHttpClient {
  if (!client) {
    const url =
      optionalEnv("CONVEX_URL") ??
      optionalEnv("NEXT_PUBLIC_CONVEX_URL") ??
      (CONVEX_PREVIEW_URL || undefined);
    if (!url) throw new Error("CONVEX_URL / NEXT_PUBLIC_CONVEX_URL not set");
    client = new ConvexHttpClient(url);
  }
  return client;
}

/** Shared server key used to authorize server-key-gated Convex mutations. */
export function getConvexServerKey(): string {
  return requireEnv("CONVEX_SERVER_KEY");
}
