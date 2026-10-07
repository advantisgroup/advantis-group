import { Elysia } from "elysia";

import { isAllowedOrigin } from "./env.js";

const ALLOWED_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, Cookie, x-convex-server-key";

/** Stands in for `@elysiajs/cors`, whose `origin` option only accepts a
 * synchronous function (confirmed against its own source — the callback's
 * return value is compared with `=== true`, never awaited). Customer
 * Performance domains used to be looked up in Convex here; since Performance
 * runs only on the intranet host that lookup is gone. Handles the
 * same two responsibilities the plugin did: tagging every response from an
 * allowed origin, and answering the browser's preflight `OPTIONS` directly. */
export function dynamicCors() {
  return new Elysia({ name: "dynamic-cors" }).onRequest(({ request, set }) => {
    const origin = request.headers.get("origin");
    const allowed = origin ? isAllowedOrigin(origin) : false;

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
