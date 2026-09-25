import { defineTable } from "convex/server";
import { v } from "convex/values";

import { attachmentValidator } from "../lib/validators";

/** Where the team is with an inquiry. Absent on rows from before it existed = "open". */
export const inquiryStateValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("answered"),
  v.literal("closed"),
  v.literal("withdrawn"),
);

/** Plain categories the customer can act on; the provider's own text stays in `error`. */
export const failureReasonValidator = v.union(
  v.literal("invalid_address"),
  v.literal("mailbox_unavailable"),
  v.literal("temporary"),
  v.literal("rate_limited"),
  v.literal("provider_error"),
  v.literal("unknown"),
);

export const inquiryEventTypeValidator = v.union(
  v.literal("created"),
  v.literal("seen"),
  v.literal("state"),
  v.literal("assigned"),
  v.literal("reply"),
  v.literal("customer_reply"),
  v.literal("callback_confirmed"),
  v.literal("callback_cancelled"),
  v.literal("callback_rescheduled"),
  v.literal("resent"),
  v.literal("withdrawn"),
);

export const marketingTables = {
  // --- Marketing (existing) ------------------------------------------------
  /**
   * One row per website inquiry (contact form). Named `emails` because it
   * started as a log of sent mails; see docs/inquiries.md for the lifecycle.
   * Everything below `error` is optional so rows from before the inquiry
   * model read back unchanged.
   */
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
    /** The mail to the team inbox. */
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("delayed"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),

    /** Sequential. Briefly shown as "AG-0042" before references came from the id; kept so those resolve. */
    nr: v.optional(v.number()),
    /** The reference, lowercased: the shortest unique end of the id (see `referenceOf`). */
    ref: v.optional(v.string()),
    locale: v.optional(v.string()),
    topicKey: v.optional(
      v.union(v.literal("withdrawal"), v.literal("question"), v.literal("legal")),
    ),
    deliveredAt: v.optional(v.number()),
    attempts: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    failureReason: v.optional(failureReasonValidator),

    /** The customer's own receipt. Absent = unknown (sent before this was tracked). */
    copyStatus: v.optional(
      v.union(
        v.literal("sent"),
        v.literal("skipped"),
        v.literal("delivered"),
        v.literal("delayed"),
        v.literal("bounced"),
        v.literal("failed"),
      ),
    ),
    copySkipReason: v.optional(v.union(v.literal("limit"), v.literal("preference"))),
    copyFailureReason: v.optional(failureReasonValidator),
    copyDeliveredAt: v.optional(v.number()),
    copyEmailId: v.optional(v.string()),

    state: v.optional(inquiryStateValidator),
    seenAt: v.optional(v.number()),
    seenByUserId: v.optional(v.id("users")),
    assignedToUserId: v.optional(v.id("users")),
    assignedAt: v.optional(v.number()),
    firstResponseAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    /** The state the customer was last mailed about, so a flurry of clicks mails once. */
    notifiedState: v.optional(inquiryStateValidator),

    /** Callback time as an instant plus the zone the person picked it in. */
    desiredAt: v.optional(v.number()),
    timeZone: v.optional(v.string()),
    callbackStatus: v.optional(
      v.union(v.literal("requested"), v.literal("confirmed"), v.literal("cancelled")),
    ),
    callbackConfirmedAt: v.optional(v.number()),
    /** sha256 of the token in the callback mail's reschedule/cancel links. */
    actionTokenHash: v.optional(v.string()),
    actionTokenExpiresAt: v.optional(v.number()),

    attachments: v.optional(v.array(attachmentValidator)),
    anonymizedAt: v.optional(v.number()),
  })
    .index("by_clerkUserId_sentAt", ["clerkUserId", "sentAt"])
    .index("by_accountEmail_sentAt", ["accountEmail", "sentAt"])
    .index("by_email_sentAt", ["email", "sentAt"])
    .index("by_nr", ["nr"])
    .index("by_ref", ["ref"])
    .index("by_state_lastActivityAt", ["state", "lastActivityAt"])
    .index("by_lastActivityAt", ["lastActivityAt"])
    .index("by_actionTokenHash", ["actionTokenHash"]),

  /** What happened to an inquiry, in order — the customer's timeline and the team's history. */
  inquiryEvents: defineTable({
    inquiryId: v.id("emails"),
    type: inquiryEventTypeValidator,
    state: v.optional(inquiryStateValidator),
    actor: v.union(v.literal("customer"), v.literal("staff"), v.literal("system")),
    actorUserId: v.optional(v.id("users")),
    at: v.number(),
  }).index("by_inquiry_at", ["inquiryId", "at"]),

  /** The reply thread under an inquiry. */
  inquiryMessages: defineTable({
    inquiryId: v.id("emails"),
    author: v.union(v.literal("staff"), v.literal("customer")),
    staffUserId: v.optional(v.id("users")),
    body: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
    via: v.union(v.literal("web"), v.literal("email")),
    createdAt: v.number(),
  }).index("by_inquiry_createdAt", ["inquiryId", "createdAt"]),

  notifyEmails: defineTable({
    email: v.string(),
    createdAt: v.number(),
    /** The site language they signed up in, so the "we're open again" mail matches it. */
    locale: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
  }).index("by_email", ["email"]),

  /**
   * One-time codes proving someone owns an address before it joins or leaves
   * the notify list. One live row per address + action; a resend replaces it.
   * Signed-in people with that address verified in Clerk skip this entirely.
   */
  notifyCodes: defineTable({
    email: v.string(),
    action: v.union(v.literal("subscribe"), v.literal("unsubscribe")),
    /** sha256 — the plain code only exists in the mail */
    codeHash: v.string(),
    expiresAt: v.number(),
    sentAt: v.number(),
    attempts: v.number(),
  }).index("by_email_action", ["email", "action"]),

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
    /** Confirmed by being signed in with this address verified, instead of the mailed link. */
    verifiedVia: v.optional(v.literal("account")),
    clerkUserId: v.optional(v.string()),
    withdrawnAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_confirmTokenHash", ["confirmTokenHash"])
    .index("by_status_requestedAt", ["status", "requestedAt"]),
};
