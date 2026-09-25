import { v } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { serverMutation, serverQuery } from "../functions";

/**
 * What a signed-in customer can see and do about everything the marketing
 * site holds on them: consents, a copy of it all, and erasing it. Called by
 * apps/marketing's `/api/account` routes with the server key; `account` is
 * resolved from Clerk there (their id and every verified address).
 */

const accountValidator = v.object({ clerkUserId: v.string(), emails: v.array(v.string()) });

async function inquiriesFor(ctx: QueryCtx, account: { clerkUserId: string; emails: string[] }) {
  const rows = new Map<string, Doc<"emails">>();
  const add = (list: Doc<"emails">[]) => list.forEach((row) => rows.set(row._id, row));

  if (account.clerkUserId) {
    add(
      await ctx.db
        .query("emails")
        .withIndex("by_clerkUserId_sentAt", (q) => q.eq("clerkUserId", account.clerkUserId))
        .collect(),
    );
  }
  for (const email of account.emails) {
    add(
      await ctx.db
        .query("emails")
        .withIndex("by_accountEmail_sentAt", (q) => q.eq("accountEmail", email))
        .collect(),
    );
    add(
      await ctx.db
        .query("emails")
        .withIndex("by_email_sentAt", (q) => q.eq("email", email))
        .collect(),
    );
  }
  return [...rows.values()].sort((a, b) => a.sentAt - b.sentAt);
}

async function leadsFor(ctx: QueryCtx, emails: string[]) {
  const leads = await Promise.all(
    emails.map((email) =>
      ctx.db
        .query("whitepaperLeads")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first(),
    ),
  );
  return leads.filter((lead): lead is Doc<"whitepaperLeads"> => lead !== null);
}

async function notifyRowsFor(ctx: QueryCtx, emails: string[]) {
  const rows = await Promise.all(
    emails.map((email) =>
      ctx.db
        .query("notifyEmails")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first(),
    ),
  );
  return rows.filter((row): row is Doc<"notifyEmails"> => row !== null);
}

/** Staff sign in with the same Clerk instance; their account belongs to the intranet. */
export const isStaff = serverQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .first();
    return user !== null && user.status !== "removed";
  },
});

/** The whitepaper and notify-list state for the Downloads and Privacy pages. */
export const consentsForAccount = serverQuery({
  args: { account: accountValidator },
  handler: async (ctx, { account }) => {
    const notify = await notifyRowsFor(ctx, account.emails);
    const leads = await leadsFor(ctx, account.emails);
    return {
      notify: notify.map((row) => ({ email: row.email, since: row.createdAt })),
      whitepaper: leads.map((lead) => ({
        email: lead.email,
        status: lead.status,
        requestedAt: lead.requestedAt,
        confirmationSentAt: lead.confirmationSentAt,
        confirmedAt: lead.confirmedAt,
        deliveredAt: lead.deliveredAt,
        delivered: lead.deliveredAt !== undefined,
        deliveryFailed: lead.deliveryError !== undefined,
        linkExpired: lead.status === "pending" && (lead.confirmTokenExpiresAt ?? 0) < Date.now(),
        consentVersion: lead.consentVersion,
        verifiedVia: lead.verifiedVia,
        withdrawnAt: lead.withdrawnAt,
      })),
    };
  },
});

/**
 * A copy of everything held on the account (GDPR Art. 15/20). Token hashes
 * and staff user ids are left out: they aren't the customer's data and mean
 * nothing outside the system.
 */
export const exportForAccount = serverQuery({
  args: { account: accountValidator },
  handler: async (ctx, { account }) => {
    const inquiries = await inquiriesFor(ctx, account);
    return {
      inquiries: await Promise.all(
        inquiries.map(async (row) => {
          const {
            actionTokenHash: _hash,
            actionTokenExpiresAt: _expires,
            seenByUserId: _seenBy,
            assignedToUserId: _assignee,
            ...rest
          } = row;
          const events = await ctx.db
            .query("inquiryEvents")
            .withIndex("by_inquiry_at", (q) => q.eq("inquiryId", row._id))
            .collect();
          const messages = await ctx.db
            .query("inquiryMessages")
            .withIndex("by_inquiry_createdAt", (q) => q.eq("inquiryId", row._id))
            .collect();
          return {
            ...rest,
            events: events.map(({ type, state, actor, at }) => ({ type, state, actor, at })),
            messages: messages.map(({ author, body, via, createdAt, attachments }) => ({
              author,
              body,
              via,
              createdAt,
              attachments: attachments?.map(({ name, contentType, size }) => ({
                name,
                contentType,
                size,
              })),
            })),
          };
        }),
      ),
      notifyList: (await notifyRowsFor(ctx, account.emails)).map(
        ({ email, createdAt, locale }) => ({
          email,
          createdAt,
          locale,
        }),
      ),
      whitepaperLeads: (await leadsFor(ctx, account.emails)).map(
        ({ confirmTokenHash: _hash, confirmTokenExpiresAt: _expires, ...lead }) => lead,
      ),
    };
  },
});

// Erasure means gone, not the trash every other delete in the repo uses (lib/trash.ts).
async function eraseInquiries(ctx: MutationCtx, rows: Doc<"emails">[]) {
  for (const row of rows) {
    const events = await ctx.db
      .query("inquiryEvents")
      .withIndex("by_inquiry_at", (q) => q.eq("inquiryId", row._id))
      .collect();
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
    for (const doc of [...events, ...messages]) await ctx.db.delete(doc._id);
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

export const eraseInquiryHistory = serverMutation({
  args: { account: accountValidator },
  handler: async (ctx, { account }) => ({
    inquiries: await eraseInquiries(ctx, await inquiriesFor(ctx, account)),
  }),
});

/** Everything, ahead of deleting the Clerk user. The API refuses staff before calling this. */
export const eraseForAccount = serverMutation({
  args: { account: accountValidator },
  handler: async (ctx, { account }) => {
    const inquiries = await eraseInquiries(ctx, await inquiriesFor(ctx, account));
    const notify = await notifyRowsFor(ctx, account.emails);
    const leads = await leadsFor(ctx, account.emails);
    for (const row of [...notify, ...leads]) await ctx.db.delete(row._id);
    for (const email of account.emails) {
      const codes = await ctx.db
        .query("notifyCodes")
        .withIndex("by_email_action", (q) => q.eq("email", email))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);
    }
    return { inquiries, notify: notify.length, whitepaperLeads: leads.length };
  },
});

/**
 * Stops the team using a whitepaper lead for contact. The row stays with
 * `withdrawnAt` set, because the opt-in itself has to stay provable.
 */
export const withdrawWhitepaperConsent = serverMutation({
  args: { account: accountValidator, email: v.string() },
  handler: async (ctx, { account, email }) => {
    if (!account.emails.includes(email)) return null;
    const lead = await ctx.db
      .query("whitepaperLeads")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!lead || lead.withdrawnAt) return null;
    await ctx.db.patch(lead._id, { withdrawnAt: Date.now() });
    return { firstName: lead.firstName, lastName: lead.lastName, company: lead.company };
  },
});
