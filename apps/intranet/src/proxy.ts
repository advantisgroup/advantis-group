import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { clerkMiddleware } from "@clerk/nextjs/server";

// Public routes that don't require an authenticated session.
const PUBLIC_ROUTE_PREFIXES = [
  "/sign-in(.*)",
  "/sign-up(.*)",
  // The shared password-reset screen. Its magic-link token is the whole
  // credential — the HR vault password it may be resetting has no Clerk
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

// Performance used to run on customer domains with its own password logins.
// It now lives only in the intranet, so those domains redirect here.
const LEGACY_PERFORMANCE_HOSTS = new Set(["perf.07er.de"]);

const INTRANET_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_INTRANET_URL ?? "https://intern.advantisgroup.de")
      .origin;
  } catch {
    return "https://intern.advantisgroup.de";
  }
})();

function legacyPerformanceRedirect(req: NextRequest): NextResponse | null {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  if (!LEGACY_PERFORMANCE_HOSTS.has(host)) return null;
  const path = req.nextUrl.pathname.startsWith("/performance")
    ? req.nextUrl.pathname
    : "/performance";
  return NextResponse.redirect(new URL(path, INTRANET_ORIGIN), 308);
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

/** Legacy Performance domains are redirected before Clerk sees the request
 * — Clerk's handshake would reject a host it doesn't know. */
export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const legacy = legacyPerformanceRedirect(req);
  if (legacy) return legacy;
  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
