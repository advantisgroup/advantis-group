import { defineTable } from "convex/server";
import { v } from "convex/values";

export const mailTables = {
  /**
   * A person's IONOS mailbox, shown read-only in the intranet's mail panel.
   * An admin sets the address and password centrally; the password is
   * encrypted by apps/api (`MAIL_ENC_KEY`) before it gets here, so this
   * deployment never holds it in plain text. No message content is stored —
   * apps/api reads the inbox live over IMAP on every open. The poll fields
   * only remember where the inbox stood, for the unread badge and for
   * noticing new mail.
   */
  mailAccounts: defineTable({
    userId: v.id("users"),
    email: v.string(),
    passwordEnc: v.string(),
    setBy: v.id("users"),
    updatedAt: v.number(),
    /** IMAP UIDVALIDITY as a string (it's a bigint on the wire). A change
     *  means old UIDs no longer point at the same messages. */
    uidValidity: v.optional(v.string()),
    uidNext: v.optional(v.number()),
    unseen: v.optional(v.number()),
    checkedAt: v.optional(v.number()),
    /** Why the last check failed; cleared by the next one that works. */
    error: v.optional(v.union(v.literal("auth"), v.literal("connect"))),
  }).index("by_user", ["userId"]),
};
