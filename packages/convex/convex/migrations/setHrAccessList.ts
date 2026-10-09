/**
 * One-time switch to the fixed HR list (Oct 2026). The HR vault (second
 * password) is gone and admins no longer get HR automatically, so access is
 * exactly the `applicantAccess` flag. This sets that flag for the given
 * emails and clears it — and delegate rights — for everyone else, then
 * deletes the leftover vault passwords/unlocks.
 *
 * Run once from the Convex dashboard (Functions →
 * `migrations/setHrAccessList:run`), first with `dryRun: true` to check who
 * matches:
 *   { "emails": ["you@…", "…"], "dryRun": true }
 * The first email is recorded as who made the change in the audit log.
 */
import { ConvexError, v } from "convex/values";

import { internalMutation } from "../functions";
import { recordUnifiedAudit } from "../lib/auditLogWrite";

export const run = internalMutation({
  args: { emails: v.array(v.string()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { emails, dryRun }) => {
    const wanted = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (wanted.length === 0) {
      throw new ConvexError({ code: "bad_request", message: "No emails given" });
    }
    const users = await ctx.db.query("users").collect();
    const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
    const notFound = wanted.filter((e) => !byEmail.has(e));
    if (notFound.length > 0) {
      // Never half-apply: a typo would otherwise lock that person out.
      return { applied: false, notFound };
    }
    const listed = new Set(wanted);
    const actor = byEmail.get(wanted[0])!;
    const name = (u: (typeof users)[number]) =>
      [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

    const granted: string[] = [];
    const revoked: string[] = [];
    for (const user of users) {
      const keep = listed.has(user.email.toLowerCase());
      if (keep && user.applicantAccess !== true) granted.push(name(user));
      if (!keep && (user.applicantAccess === true || user.applicantAccessDelegate === true)) {
        revoked.push(name(user));
      }
      if (dryRun) continue;
      if (keep) {
        if (user.applicantAccess !== true) await ctx.db.patch(user._id, { applicantAccess: true });
      } else if (user.applicantAccess === true || user.applicantAccessDelegate === true) {
        await ctx.db.patch(user._id, { applicantAccess: false, applicantAccessDelegate: false });
      }
    }

    const hasAccess = users.filter((u) => listed.has(u.email.toLowerCase())).map(name);
    if (dryRun) return { applied: false, hasAccess, granted, revoked };

    for (const row of await ctx.db.query("applicantVaultPasswords").collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query("applicantVaultUnlocks").collect()) {
      await ctx.db.delete(row._id);
    }

    const at = Date.now();
    const detail = `granted: ${granted.join(", ") || "-"}; revoked: ${revoked.join(", ") || "-"}`;
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: actor._id,
      action: "set_hr_access_list",
      target: detail,
      at,
    });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: actor._id,
      action: "set_hr_access_list",
      detail,
      at,
    });
    return { applied: true, hasAccess, granted, revoked };
  },
});
