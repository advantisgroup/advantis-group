import { NextResponse, type NextRequest } from "next/server";

import { api } from "@advantis/convex/api";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";

// Public routes that don't require an authenticated session.
const isPublicRoute = createRouteMatcher([
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
]);

// One Advantis-owned wildcard domain covers every Performance tenant
// (see `companies.ts` — a subdomain of it is what Vercel's Domains API
// auto-verifies with zero manual step). Unset until that domain exists;
// `resolveTenantRewrite` is then a no-op for every request, same as today.
const PERFORMANCE_ROOT_DOMAIN = process.env.PERFORMANCE_PLATFORM_ROOT_DOMAIN;

function hostWithoutPort(host: string): string {
  return host.split(":")[0];
}

/**
 * Resolves a request's `Host` header to a Performance tenant company and
 * rewrites it into the `/performance` carve-out — the mechanism that lets a
 * brand-new company go live on its own subdomain with zero code deploy.
 * Returns `null` for anything that isn't a tenant subdomain (the main
 * intranet host, localhost in dev, `PERFORMANCE_PLATFORM_ROOT_DOMAIN` not
 * configured yet, …), so the existing Clerk flow below runs completely
 * unaffected for everyone else — today's production hostname needs no
 * special-casing here because it simply never matches this pattern.
 *
 * This header is UI-only, never a trust boundary: every Convex
 * query/mutation re-derives `companyId` from the caller's resolved session,
 * never from a client-supplied header. A spoofed header can at worst render
 * the wrong tenant's login copy.
 */
async function resolveTenantRewrite(
  req: NextRequest
): Promise<NextResponse | null> {
  if (!PERFORMANCE_ROOT_DOMAIN) return null;
  const host = hostWithoutPort(req.headers.get("host") ?? "");
  if (!host.endsWith(`.${PERFORMANCE_ROOT_DOMAIN}`)) return null;

  const company = await fetchQuery(api.companies.getBySubdomain, {
    subdomain: host,
  });

  const url = req.nextUrl.clone();
  if (!company) {
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

export default clerkMiddleware(async (auth, req) => {
  const tenantRewrite = await resolveTenantRewrite(req);
  if (tenantRewrite) return tenantRewrite;

  if (!isPublicRoute(req)) {
    // Land signed-out visitors on sign-up rather than Clerk's configured
    // sign-in default — it's the better-designed entry point, and existing
    // members can still reach sign-in from the link inside it.
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-up", req.url).toString(),
    });
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
