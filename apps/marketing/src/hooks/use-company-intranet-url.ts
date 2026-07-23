"use client";

import { useUser } from "@clerk/nextjs";

/**
 * Marketing and the intranet share one Clerk instance (root domain
 * advantisgroup.de, intern.advantisgroup.de as an allowed subdomain), so
 * being signed in here already means the same session is active on the
 * intranet too — this hook is just a navigational nicety, not an auth check.
 * An `@advantisgroup.de` email on an otherwise customer-facing account is a
 * good signal the visitor is actually a colleague who landed on the public
 * site and would rather be in the intranet. Real intranet access is still
 * gated by its own Convex `users`/invite checks regardless of what this
 * returns.
 *
 * Returns the intranet URL to link to, or null when either the visitor
 * doesn't look like a colleague or the deployment (env var) isn't set up.
 */
const COMPANY_EMAIL_DOMAIN = "advantisgroup.de";

export function useCompanyIntranetUrl(): string | null {
  const { user, isSignedIn } = useUser();
  const intranetUrl = process.env.NEXT_PUBLIC_INTRANET_URL;
  if (!intranetUrl || !isSignedIn) return null;
  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "";
  return email.endsWith(`@${COMPANY_EMAIL_DOMAIN}`) ? intranetUrl : null;
}
