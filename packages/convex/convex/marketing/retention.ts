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
