import { internal } from "../_generated/api";
import { internalMutation } from "../functions";
import { INQUIRY_RETENTION_YEARS } from "./lib/inquiry";

const YEAR = 365 * 24 * 60 * 60 * 1000;
const BATCH = 100;

/**
 * Blanks the personal parts of inquiries nobody has touched for
 * INQUIRY_RETENTION_YEARS: who sent it, how to reach them, what they wrote,
 * and the thread under it. The row itself stays (with its number, type and
 * dates) so counts and the reference sequence stay intact. Daily cron.
 */
export const anonymizeStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - INQUIRY_RETENTION_YEARS * YEAR;
    const stale = await ctx.db
      .query("emails")
      .withIndex("by_lastActivityAt", (q) => q.lt("lastActivityAt", cutoff))
      .filter((q) => q.eq(q.field("anonymizedAt"), undefined))
      .take(BATCH);

    for (const row of stale) {
      const messages = await ctx.db
        .query("inquiryMessages")
        .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", row._id))
        .collect();
      for (const attachment of [
        ...(row.attachments ?? []),
        ...messages.flatMap((message) => message.attachments ?? []),
      ]) {
        await ctx.storage.delete(attachment.storageId);
      }
      for (const message of messages) await ctx.db.delete(message._id);

      await ctx.db.patch(row._id, {
        firstName: "",
        lastName: "",
        email: "",
        phone: undefined,
        company: undefined,
        subject: "",
        message: "",
        notes: undefined,
        topic: undefined,
        accountEmail: "",
        accountName: "",
        clerkUserId: "",
        error: undefined,
        attachments: undefined,
        actionTokenHash: undefined,
        anonymizedAt: Date.now(),
      });
    }

    if (stale.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.marketing.retention.anonymizeStale, {});
    }
    return { anonymized: stale.length };
  },
});

// the confirmation link dies after 48 hours; a request nobody confirmed is only an address we hold
const UNCONFIRMED_LEAD_DAYS = 30;
// the usual ceiling for visitor statistics: a year to compare against, plus a little
export const ANALYTICS_RETENTION_MONTHS = 14;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Whitepaper requests that were never confirmed, and withdrawn ones once the
 * record of the consent no longer has to be kept (as long as an inquiry's
 * limitation period, INQUIRY_RETENTION_YEARS). Daily cron.
 */
export const purgeLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const unconfirmed = await ctx.db
      .query("whitepaperLeads")
      .withIndex("by_status_requestedAt", (q) =>
        q.eq("status", "pending").lt("requestedAt", now - UNCONFIRMED_LEAD_DAYS * DAY),
      )
      .take(BATCH);
    const withdrawnBefore = now - INQUIRY_RETENTION_YEARS * YEAR;
    const withdrawn = await ctx.db
      .query("whitepaperLeads")
      .withIndex("by_status_requestedAt", (q) => q.eq("status", "confirmed"))
      .filter((q) =>
        q.and(
          q.neq(q.field("withdrawnAt"), undefined),
          q.lt(q.field("withdrawnAt"), withdrawnBefore),
        ),
      )
      .take(BATCH);

    for (const lead of [...unconfirmed, ...withdrawn]) await ctx.db.delete(lead._id);

    if (unconfirmed.length === BATCH || withdrawn.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.marketing.retention.purgeLeads, {});
    }
    return { deleted: unconfirmed.length + withdrawn.length };
  },
});

/** Pageviews and conversion events older than ANALYTICS_RETENTION_MONTHS. Daily cron. */
export const purgeAnalytics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - (ANALYTICS_RETENTION_MONTHS / 12) * YEAR;
    // rows are written once at `createdAt`, so their creation time is the same instant
    const pageviews = await ctx.db
      .query("analyticsPageviews")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(BATCH * 5);
    const events = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(BATCH * 5);

    for (const row of pageviews) await ctx.db.delete(row._id);
    for (const row of events) await ctx.db.delete(row._id);

    if (pageviews.length === BATCH * 5 || events.length === BATCH * 5) {
      await ctx.scheduler.runAfter(0, internal.marketing.retention.purgeAnalytics, {});
    }
    return { deleted: pageviews.length + events.length };
  },
});
