import { defineTable } from "convex/server";
import { v } from "convex/values";

import { attachmentValidator } from "../lib/validators";

export const itTicketsTables = {
  // --- IT Ticket System (IT-Meldesystem) -----------------------------------
  // Shared, org-wide IT issue log — every active intranet user can file,
  // edit, and close any ticket (mirrors the original single-tenant tool this
  // replaced, where every entry was visible/editable by everyone with access).
  itTicketCategories: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }),

  itTickets: defineTable({
    /** Sequential per-workspace ticket number ("#003"), not a Convex id. */
    nr: v.number(),
    /** References an `itTicketCategories.name` by value, not by id — a
     * deleted category still reads back correctly on old tickets. */
    category: v.string(),
    date: v.string(), // ISO date (YYYY-MM-DD)
    /** Free-text "Angelegt von" name, as in the original tool — not
     * necessarily `createdByUserId`'s own display name. */
    createdByName: v.string(),
    createdByUserId: v.id("users"),
    /** Optional during rollout: existing shared-log tickets predate ownership. */
    assignedToUserId: v.optional(v.id("users")),
    assignedAt: v.optional(v.number()),
    status: v.union(v.literal("offen"), v.literal("bearbeitung"), v.literal("closed")),
    /** Only meaningful for the "SF" category — extra fields the form reveals. */
    topic: v.optional(v.string()),
    camId: v.optional(v.string()),
    custNo: v.optional(v.string()),
    info: v.optional(v.string()),
    relatedLinks: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("guidebook"),
            v.literal("announcement"),
            v.literal("error_measure"),
            v.literal("other"),
          ),
          label: v.string(),
          url: v.string(),
        }),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_nr", ["nr"])
    .index("by_creator", ["createdByUserId"])
    .index("by_assignee", ["assignedToUserId"])
    // Both back `/admin`'s throughput timelines: "opened in window" over
    // `createdAt`, "closed in window" over the closing edit's `updatedAt`.
    // Without the second one a ticket opened before the window but closed
    // inside it would be invisible to the closed-per-day series.
    .index("by_createdAt", ["createdAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  itTicketStatusHistory: defineTable({
    ticketId: v.id("itTickets"),
    status: v.union(v.literal("offen"), v.literal("bearbeitung"), v.literal("closed")),
    previousStatus: v.optional(
      v.union(v.literal("offen"), v.literal("bearbeitung"), v.literal("closed")),
    ),
    changedByUserId: v.id("users"),
    changedAt: v.number(),
  }).index("by_ticket_and_changedAt", ["ticketId", "changedAt"]),

  /** A time-boxed, single-purpose cover for Clockodo absence approvals. */
  approvalDelegations: defineTable({
    delegatorUserId: v.id("users"),
    delegateUserId: v.id("users"),
    scope: v.literal("absence_approvals"),
    startsAt: v.number(),
    endsAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_delegate_and_endsAt", ["delegateUserId", "endsAt"])
    .index("by_delegator_and_endsAt", ["delegatorUserId", "endsAt"]),

  /** A manager-confirmed handover record; the actions it references stay in
   * their owning modules instead of being copied into a new task system. */
  offboardingChecklists: defineTable({
    userId: v.id("users"),
    lastWorkingDay: v.optional(v.string()),
    completedSteps: v.array(
      v.union(
        v.literal("handover"),
        v.literal("tickets"),
        v.literal("guidebooks"),
        v.literal("files"),
        v.literal("devices"),
        v.literal("access"),
      ),
    ),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Per-ticket chat thread — opt-in (a ticket has one iff someone with the
  // `manage_it_ticket_threads` capability, or a manager+, started it) rather
  // than every ticket getting one automatically. Everyone can read a thread
  // once it exists (mirrors the ticket log itself being org-wide-visible);
  // only capability holders can start one, post in it, or lock/unlock it.
  // Auto-locked when its ticket's status becomes "closed" (see
  // `itTickets.setStatus`); reopening the ticket does not auto-unlock —
  // that's a deliberate manual action.
  itTicketThreads: defineTable({
    ticketId: v.id("itTickets"),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    // Denormalized for cheap "tickets with an active thread" quick-nav
    // sorting, same reasoning as conversations.lastMessageAt in chat.
    lastMessageAt: v.number(),
    lockedAt: v.optional(v.number()),
    lockedByUserId: v.optional(v.id("users")),
    lockReason: v.optional(v.union(v.literal("manual"), v.literal("ticket_closed"))),
  }).index("by_ticket", ["ticketId"]),

  // A real message or an inline system event (thread locked/unlocked),
  // interleaved by `createdAt` in the thread view — the system rows render
  // as a centered WhatsApp-style pill ("Locked by X") rather than a bubble.
  itTicketMessages: defineTable(
    v.union(
      v.object({
        kind: v.literal("message"),
        threadId: v.id("itTicketThreads"),
        senderUserId: v.id("users"),
        body: v.string(),
        /** Optional, unlike chat's required array — every message written
         *  before ticket threads supported attachments predates the field. */
        attachments: v.optional(v.array(attachmentValidator)),
        editedAt: v.optional(v.number()),
        deletedAt: v.optional(v.number()),
        createdAt: v.number(),
      }),
      v.object({
        kind: v.literal("system"),
        threadId: v.id("itTicketThreads"),
        event: v.union(v.literal("locked"), v.literal("unlocked")),
        actorUserId: v.id("users"),
        createdAt: v.number(),
      }),
    ),
  ).index("by_thread", ["threadId"]),

  // Mirrors `messageReactions` — same shape so the chat reaction UI can be
  // reused against ticket threads without a second set of concepts.
  itTicketMessageReactions: defineTable({
    messageId: v.id("itTicketMessages"),
    threadId: v.id("itTicketThreads"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user", ["messageId", "userId"])
    .index("by_thread", ["threadId"]),
};
