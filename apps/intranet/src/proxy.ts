import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";

// Public routes that don't require an authenticated session.
const PUBLIC_ROUTE_PREFIXES = [
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Performance dashboard — password-gated on its own (performanceAuth.ts),
  // not yet coupled to Clerk. See AGENTS.md / the Performance feature plan.
  "/performance(.*)",
  // The shared password-reset screen. Its magic-link token is the whole
  // credential — the Performance login it may be resetting has no Clerk
  // account behind it to sign in with first.
  "/password(.*)",
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

type TenantLookup = {
  companyId: Id<"companies">;
  name: string;
  slug: string;
  status: Doc<"companies">["status"];
} | null;

/** Per-hostname cache for the Convex round-trip below — every single
 * request (full page loads, RSC/prefetch navigation fetches) matching this
 * middleware's matcher otherwise re-queries Convex, even though the same
 * handful of hostnames repeat constantly across one visitor's session, which
 * is what made `companies:getByDomain` show up spammed in the Convex logs on
 * completely ordinary navigation. Mirrors `apps/api/src/lib/cors.ts`'s
 * `isActiveCompanyOrigin` cache for the identical query — negative results
 * get a shorter TTL so a typo'd/never-registered hostname doesn't get stuck
 * "unknown" for as long as a real company domain stays cached. */
const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 10_000;
const tenantCache = new Map<string, { company: TenantLookup; expiresAt: number }>();

async function lookupTenant(host: string): Promise<TenantLookup> {
  const cached = tenantCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.company;

  const company = await fetchQuery(api.performance.companies.getByDomain, { domain: host });
  tenantCache.set(host, {
    company,
    expiresAt: Date.now() + (company ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  });
  return company;
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

  const company = await lookupTenant(host);

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

  // `/password` stays where it is on every host — it's one shared screen for
  // every password-guarded area (see `app/password/page.tsx`), so prefixing
  // it here would give a tenant domain a 404 for its own reset links. It
  // still goes through this branch rather than falling through to
  // `clerkHandler`, for the reason in the doc comment below.
  url.pathname =
    url.pathname === "/"
      ? "/performance"
      : url.pathname === "/password" || url.pathname.startsWith("/performance")
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
    // members can still reach sign-in from the link inside it. The page they
    // asked for rides along as `redirect_url`, which Clerk carries across to
    // sign-in and follows once they're in.
    const signUp = new URL("/sign-up", req.url);
    const requested = req.nextUrl.pathname + req.nextUrl.search;
    if (requested !== "/") {
      signUp.searchParams.set("redirect_url", new URL(requested, req.url).toString());
    }
    await auth.protect({ unauthenticatedUrl: signUp.toString() });
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
