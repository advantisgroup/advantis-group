"use client";

import { api } from "@advantis/convex/api";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";

/**
 * Marketing and the intranet share one Clerk instance (root domain
 * advantisgroup.de, intern.advantisgroup.de as an allowed subdomain), so
 * being signed in here already means the same session is active on the
 * intranet too — this hook is just a navigational nicety, not an auth check.
 *
 * Checks real intranet membership via `api.users.me` (the same
 * `getCurrentUser` lookup the intranet itself gates on — see
 * packages/convex/convex/lib/auth.ts) rather than guessing from the email
 * domain: employees sign up under any of Advantis Group's brand domains
 * (advantisgroup.de, salespirates.de, ...), and some genuine intranet
 * members are `external` invitees on a third-party domain entirely, so a
 * hardcoded domain allowlist would always be missing someone.
 *
 * Returns the intranet URL to link to, or null when either the visitor
 * has no provisioned intranet account or the deployment (env var) isn't
 * set up.
 */
export function useCompanyIntranetUrl(): string | null {
  const { isSignedIn } = useUser();
  const intranetUrl = process.env.NEXT_PUBLIC_INTRANET_URL;
  const me = useQuery(api.users.me, isSignedIn ? {} : "skip");
  if (!intranetUrl || !me) return null;
  return intranetUrl;
}
