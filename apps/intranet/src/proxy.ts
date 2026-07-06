import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes that don't require an authenticated session.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Temporary guest tour — token-gated, no Clerk session.
  "/guest(.*)",
  // Legal pages must be readable by anyone, including rejected sign-ups.
  "/privacy(.*)",
  "/terms(.*)",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      // Land signed-out visitors on sign-up rather than Clerk's configured
      // sign-in default — it's the better-designed entry point, and existing
      // members can still reach sign-in from the link inside it.
      await auth.protect({
        unauthenticatedUrl: new URL("/sign-up", req.url).toString(),
      });
    }
  },
  {
    secretKey: process.env.INTERNAL_CLERK_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_INTERNAL_CLERK_PUBLISHABLE_KEY,
  }
);

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
