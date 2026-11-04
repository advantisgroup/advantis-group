import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import { APPLICANT_RETENTION_DAYS } from "./lib/retention";

const DAY_MS = 86_400_000;

/**
 * The Bewerber-Archiv: everyone archived without being hired. They sit here
 * until the retention cron deletes them (see hr/retention.ts) — six months
 * after archiving, or when a longer talent-pool consent runs out. Hired
 * applicants are left out: they live on as employee records.
 */
export const list = userQuery({
  applicant: "access",
  args: {},
  handler: async (ctx) => {
    const archived = await ctx.db
      .query("applicants")
      .withIndex("by_archivedAt", (q) => q.gt("archivedAt", 0))
      .order("desc")
      .take(2000);
    return archived
      .filter((a) => !a.convertedEmployeeProfileId && !a.deletedAt)
      .map((a) => {
        const archivedAt = a.archivedAt ?? 0;
        const retentionEnd = archivedAt + APPLICANT_RETENTION_DAYS * DAY_MS;
        return {
          _id: a._id,
          name: a.name,
          email: a.email ?? null,
          position: a.position ?? null,
          rating: a.rating ?? null,
          createdAt: a.createdAt,
          archivedAt,
          poolConsentUntil: a.poolConsentUntil ?? null,
          // The cron runs daily, so this is the earliest day it goes.
          deletesAt: Math.max(retentionEnd, a.poolConsentUntil ?? 0),
        };
      });
  },
});

/** Take an applicant back out of the archive into the recruiting list. */
export const restore = userMutation({
  applicant: "access",
  args: { applicantId: v.id("applicants") },
  handler: async (ctx, { applicantId }) => {
    const applicant = await ctx.db.get(applicantId);
    if (!applicant || applicant.deletedAt) {
      throw new ConvexError({ code: "not_found", message: "Applicant not found" });
    }
    if (applicant.convertedEmployeeProfileId) {
      // Hiring archives too; undoing that is `revertConversion`, which also
      // removes the employee record it created.
      throw new ConvexError({ code: "invalid", message: "Applicant was hired" });
    }
    if (!applicant.archivedAt) return { ok: true };
    await ctx.db.patch(applicantId, { archivedAt: undefined });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: ctx.caller.user._id,
      action: "applicant_restored",
      target: applicantId,
      at: Date.now(),
    });
    return { ok: true };
  },
});
