import { type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";

/**
 * How long an archived applicant who wasn't hired is kept. Six months after
 * a rejection is common practice under German data-protection rules (it
 * covers the window for discrimination claims); confirm the number with
 * whoever handles data protection before relying on it.
 */
export const APPLICANT_RETENTION_DAYS = 183;

/** Delete an applicant and everything recorded about them. */
export async function purgeApplicant(ctx: MutationCtx, applicantId: Id<"applicants">) {
  const [kontakte, emails, interviews, termine, documents] = await Promise.all([
    ctx.db
      .query("applicantContacts")
      .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
      .collect(),
    ctx.db
      .query("applicantEmails")
      .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
      .collect(),
    ctx.db
      .query("applicantInterviews")
      .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
      .collect(),
    ctx.db
      .query("applicantAppointments")
      .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
      .collect(),
    ctx.db
      .query("applicantDocuments")
      .withIndex("by_applicant", (q) => q.eq("applicantId", applicantId))
      .collect(),
  ]);

  for (const doc of documents) await ctx.storage.delete(doc.storageId);
  for (const rows of [kontakte, emails, interviews, termine, documents]) {
    for (const row of rows) await ctx.db.delete(row._id);
  }
  await ctx.db.delete(applicantId);
}
