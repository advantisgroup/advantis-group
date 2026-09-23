import { query } from "../functions";
import { getFlagRow } from "../lib/featureFlags";

/**
 * Whether the website's contact forms are open, from the `marketingSubmissions`
 * feature flag the intranet admin panel toggles. Public on purpose: it's what
 * every visitor's contact page shows anyway.
 *
 * `null` until an admin has toggled it once — apps/marketing then falls back
 * to its old NEXT_PUBLIC_ALLOW_SUBMISSIONS env var, so shipping the flag
 * doesn't flip the forms either way on its own.
 */
export const submissionsOpen = query({
  args: {},
  handler: async (ctx) => (await getFlagRow(ctx, "marketingSubmissions"))?.enabled ?? null,
});
