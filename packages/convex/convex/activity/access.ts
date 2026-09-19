import { userQuery } from "../functions";
import { getAdminEmails, getAllowedDomains } from "../lib/auth";

/**
 * Read-only view of the intranet's email-domain access control, surfaced in the
 * activity Settings → Access card.
 *
 * Upstream ActivityTrack kept an admin-editable domain allowlist in its own
 * settings table and enforced it in `users.store`. The advantis intranet
 * instead governs sign-in centrally: allowed domains come from the
 * `ALLOWED_EMAIL_DOMAINS` env var and admins from `ADMIN_EMAILS` (plus anyone
 * already promoted to the `admin` role). That gating lives in
 * `lib/auth.ensureUser` and the access-requests flow, so this surface is
 * intentionally informational only — there is no `setAllowedDomains` mutation
 * because editing here would not change who can actually sign in. Domains are
 * adjusted via the Convex env var, and access is granted through the
 * intranet-wide admin area (invites / access requests).
 */
export const getAccessControl = userQuery({
  args: {},
  handler: async (ctx) => {
    // Permanent admins are seeded from the env var; additionally surface anyone
    // currently holding the `admin` role so the list reflects live state.
    const roleAdmins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();

    const adminEmails = [
      ...new Set([...getAdminEmails(), ...roleAdmins.map((u) => u.email.toLowerCase())]),
    ].sort();

    return {
      allowedDomains: getAllowedDomains(),
      adminEmails,
    };
  },
});
