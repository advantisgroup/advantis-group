import { defineTable } from "convex/server";
import { v } from "convex/values";

export const marketingTables = {
  // --- Marketing (existing) ------------------------------------------------
  emails: defineTable({
    messageId: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    subject: v.string(),
    message: v.string(),
    company: v.optional(v.string()),
    submissionType: v.union(v.literal("message"), v.literal("callback"), v.literal("other")),
    topic: v.optional(v.string()),
    desiredDateTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    accountEmail: v.string(),
    accountName: v.string(),
    clerkUserId: v.string(),
    sentAt: v.number(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  })
    .index("by_clerkUserId_sentAt", ["clerkUserId", "sentAt"])
    .index("by_accountEmail_sentAt", ["accountEmail", "sentAt"]),

  notifyEmails: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  /**
   * Whitepaper download leads from the marketing site's `/whitepaper` page,
   * captured under a double opt-in: the form only ever writes a `pending` row
   * plus a confirmation-token hash, and the document is mailed out once the
   * address has proven itself by opening the confirmation link.
   *
   * One row per address — a second request for an address already on file
   * refreshes its details and re-issues the token rather than inserting a
   * duplicate lead.
   */
  whitepaperLeads: defineTable({
    /** Lowercased — the identity of the row, and what the document is mailed to. */
    email: v.string(),
    company: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    /** Marketing-site locale the form was filled in, so both mails match it. */
    locale: v.string(),
    status: v.union(v.literal("pending"), v.literal("confirmed")),
    /**
     * sha256 of the double opt-in token. The plaintext exists only inside the
     * confirmation mail, so a leaked database row cannot confirm a lead.
     */
    confirmTokenHash: v.optional(v.string()),
    confirmTokenExpiresAt: v.optional(v.number()),
    requestedAt: v.number(),
    confirmationSentAt: v.optional(v.number()),
    confirmationEmailId: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    /**
     * Double opt-in proof (Nachweispflicht): which consent wording was shown,
     * and the addresses the request and the confirmation came from.
     */
    consentVersion: v.string(),
    requestIp: v.optional(v.string()),
    confirmIp: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
    deliveryEmailId: v.optional(v.string()),
    deliveryError: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_confirmTokenHash", ["confirmTokenHash"])
    .index("by_status_requestedAt", ["status", "requestedAt"]),
};
