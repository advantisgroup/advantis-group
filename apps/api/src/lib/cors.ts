import { api } from "@advantis/convex/api";
import { Elysia } from "elysia";

import { getConvex } from "./convex.js";
import { isAllowedOrigin } from "./env.js";

const ALLOWED_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, Cookie, x-convex-server-key";

/** Per-hostname cache for the Convex round-trip below — the same tenant
 * domain hits this repeatedly (every upload/export request from one
 * company), and this API has no other reason to remember hostnames between
 * requests. Negative results get a shorter TTL so a bogus/attacker Origin
 * can't force a Convex query on every single request, while a company that
 * just finished DNS verification doesn't stay locked out for the full
 * positive TTL. */
const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 10_000;
const originCache = new Map<string, { allowed: boolean; expiresAt: number }>();

/** Companies (`companies.ts`) each bring their own, fully independent
 * domain — e.g. a client's `perf.<theirdomain>` — so unlike
 * `.advantisgroup.de`/`.vercel.app` there's no shared suffix to allowlist
 * statically; it has to be checked against Convex. Mirrors
 * `apps/intranet/src/proxy.ts`'s tenant lookup: same `companies.getByDomain`
 * query, same "active" gate, so a company only starts working here the
 * moment its domain actually goes live in the UI. */
async function isActiveCompanyOrigin(origin: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  const cached = originCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  let allowed = false;
  try {
    const company = await getConvex().query(api.companies.getByDomain, {
      domain: hostname,
    });
    allowed = company?.status === "active";
  } catch (err) {
    console.error("[cors] company domain lookup failed:", err);
  }

  originCache.set(hostname, {
    allowed,
    expiresAt: Date.now() + (allowed ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  });
  return allowed;
}

async function isOriginAllowed(origin: string): Promise<boolean> {
  return isAllowedOrigin(origin) || isActiveCompanyOrigin(origin);
}

/** Stands in for `@elysiajs/cors`, whose `origin` option only accepts a
 * synchronous function (confirmed against its own source — the callback's
 * return value is compared with `=== true`, never awaited), which makes it
 * incapable of the Convex lookup `isActiveCompanyOrigin` needs. Handles the
 * same two responsibilities the plugin did: tagging every response from an
 * allowed origin, and answering the browser's preflight `OPTIONS` directly. */
export function dynamicCors() {
  return new Elysia({ name: "dynamic-cors" }).onRequest(async ({ request, set }) => {
    const origin = request.headers.get("origin");
    const allowed = origin ? await isOriginAllowed(origin) : false;

    if (allowed) {
      set.headers["access-control-allow-origin"] = origin as string;
      set.headers["vary"] = "Origin";
      set.headers["access-control-allow-credentials"] = "true";
    }

    if (request.method === "OPTIONS") {
      if (allowed) {
        set.headers["access-control-allow-methods"] = ALLOWED_METHODS;
        set.headers["access-control-allow-headers"] = ALLOWED_HEADERS;
        set.headers["access-control-max-age"] = "5";
      }
      return new Response(null, { status: 204 });
    }
  });
}
