import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { api } from "@advantis/convex/api";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";

// Public routes that don't require an authenticated session.
const PUBLIC_ROUTE_PREFIXES = [
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Temporary guest tour — token-gated, no Clerk session.
  "/guest(.*)",
  // Performance dashboard — password-gated on its own (performanceAuth.ts),
  // not yet coupled to Clerk. See AGENTS.md / the Performance feature plan.
  "/performance(.*)",
  // Legal pages must be readable by anyone, including rejected sign-ups.
  "/privacy(.*)",
  "/terms(.*)",
  "/imprint(.*)",
].map((pattern) => pattern.replace("(.*)", ""));

function isPublicRoute(req: NextRequest): boolean {
  const pathname = req.nextUrl.pathname;
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// The intranet's own hostname — every request here is excluded from the
// tenant-company lookup below (skips a Convex round-trip on completely
// normal intranet traffic, and guarantees the existing production hostname
// is never mistaken for a company domain). Companies bring their own,
// fully independent domains (see `companies.ts`), so there's no shared
// suffix pattern to check instead — this allowlist is the only cheap
// exclusion available.
const INTRANET_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_INTRANET_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
})();

function hostWithoutPort(host: string): string {
  return host.split(":")[0];
}

/**
 * Resolves a request's `Host` header to a Performance tenant company and
 * rewrites it into the `/performance` carve-out — the mechanism that lets a
 * brand-new company go live on its own domain with no code deploy. Returns
 * `null` for the main intranet host (and localhost in dev, and anything
 * else `NEXT_PUBLIC_INTRANET_URL` doesn't distinguish it from), so the
 * existing Clerk flow below runs completely unaffected for everyone else.
 *
 * This header is UI-only, never a trust boundary: every Convex
 * query/mutation re-derives `companyId` from the caller's resolved session,
 * never from a client-supplied header. A spoofed header can at worst render
 * the wrong tenant's login copy.
 */
async function resolveTenantRewrite(req: NextRequest): Promise<NextResponse | null> {
  const host = hostWithoutPort(req.headers.get("host") ?? "");
  if (!host || host === "localhost" || host === INTRANET_HOST) return null;

  const company = await fetchQuery(api.companies.getByDomain, { domain: host });

  const url = req.nextUrl.clone();
  if (!company) {
    // No company was ever registered for this domain — most likely the
    // intranet reached by a Vercel preview/other hostname
    // `NEXT_PUBLIC_INTRANET_URL` doesn't cover, not an actual mistyped
    // tenant domain, so fall through to the normal Clerk-gated app rather
    // than showing "unknown company".
    return null;
  }
  if (company.status !== "active") {
    // A real company domain, just not DNS-verified (or provisioning, or
    // failed) yet — show "not live yet" rather than silently falling
    // through to Advantis's own Clerk-gated intranet, which would be
    // actively wrong for a client visiting their own not-yet-ready domain.
    url.pathname = "/performance/unknown-tenant";
    return NextResponse.rewrite(url);
  }

  url.pathname =
    url.pathname === "/"
      ? "/performance"
      : url.pathname.startsWith("/performance")
        ? url.pathname
        : `/performance${url.pathname}`;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-performance-company-id", company.companyId);
  requestHeaders.set("x-performance-company-slug", company.slug);
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Land signed-out visitors on sign-up rather than Clerk's configured
    // sign-in default — it's the better-designed entry point, and existing
    // members can still reach sign-in from the link inside it.
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-up", req.url).toString(),
    });
  }
});

/** The tenant-domain check must run *before* `clerkMiddleware` gets a chance
 * to touch the request at all — not just before our own `auth.protect()`
 * call. Clerk's SDK performs its own cross-origin session-handshake step as
 * part of initializing `auth()`, which validates the eventual redirect
 * target against Clerk's configured allowed origins. A brand-new company
 * domain is never one of those (and never should need to be — Performance
 * deliberately doesn't share auth with Clerk), so if a tenant request ever
 * reached `clerkMiddleware`'s own internals, that handshake step 400s with
 * "does not match one of the allowed values for parameter redirect_url"
 * before our tenant rewrite below ever gets a chance to run. Resolving the
 * tenant here, outside `clerkMiddleware` entirely, means a registered
 * company domain never enters Clerk's code path at all. */
export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const tenantRewrite = await resolveTenantRewrite(req);
  if (tenantRewrite) return tenantRewrite;
  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
