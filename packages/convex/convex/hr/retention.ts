import { ConvexError, v } from "convex/values";

import { internalMutation, userMutation } from "../functions";
import { APPLICANT_RETENTION_DAYS, purgeApplicant } from "./lib/retention";

const DAY_MS = 86_400_000;

/** How long someone may agree to stay in the talent pool at most. */
const MAX_POOL_CONSENT_MONTHS = 24;

/**
 * Record that an applicant agreed to stay in the talent pool, so the
 * retention cron keeps them past the usual window. `months: 0` withdraws it.
 */
export const setPoolConsent = userMutation({
  applicant: "access",
  args: { applicantId: v.id("applicants"), months: v.number() },
  handler: async (ctx, { applicantId, months }) => {
    if (!Number.isInteger(months) || months < 0 || months > MAX_POOL_CONSENT_MONTHS) {
      throw new ConvexError({ code: "bad_request", message: "Invalid consent period" });
    }
    const applicant = await ctx.db.get(applicantId);
    if (!applicant) throw new ConvexError({ code: "not_found", message: "Applicant not found" });
    const until = new Date();
    until.setMonth(until.getMonth() + months);
    await ctx.db.patch(applicantId, {
      poolConsentUntil: months === 0 ? undefined : until.getTime(),
    });
    return { poolConsentUntil: months === 0 ? null : until.getTime() };
  },
});

/**
 * Daily: delete applicants who were archived without being hired more than
 * `APPLICANT_RETENTION_DAYS` ago, unless their talent-pool consent still runs.
 */
export const purgeExpiredApplicants = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - APPLICANT_RETENTION_DAYS * DAY_MS;
    const archived = ctx.db
      .query("applicants")
      .withIndex("by_archivedAt", (q) => q.gt("archivedAt", 0).lte("archivedAt", cutoff));
    let purged = 0;
    for await (const applicant of archived) {
      if (applicant.convertedEmployeeProfileId) continue;
      if (applicant.poolConsentUntil && applicant.poolConsentUntil > now) continue;
      await purgeApplicant(ctx, applicant._id);
      if (++purged >= 100) break;
    }
    return { purged };
  },
});
