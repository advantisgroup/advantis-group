import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared validators -----------------------------------------------------------

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee")
);

/** Who an event/announcement targets. */
export const audienceValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("department"), department: v.string() }),
  v.object({ kind: v.literal("users"), userIds: v.array(v.id("users")) })
);

const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  kind: v.union(v.literal("image"), v.literal("file")),
  name: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  size: v.optional(v.number()),
  contentType: v.optional(v.string()),
});

const linkPreviewValidator = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  siteName: v.optional(v.string()),
});

export default defineSchema({
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
    submissionType: v.union(
      v.literal("message"),
      v.literal("callback"),
      v.literal("other")
    ),
    topic: v.optional(v.string()),
    desiredDateTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    accountEmail: v.string(),
    accountName: v.string(),
    clerkUserId: v.string(),
    sentAt: v.number(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  }).index("by_clerkUserId_sentAt", ["clerkUserId", "sentAt"]),

  notifyEmails: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // --- Intranet: identity & access ----------------------------------------
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: roleValidator,
    department: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    managerId: v.optional(v.id("users")),
    status: v.union(v.literal("active"), v.literal("suspended")),
    /** Clockodo coworker id, for linking absence mirrors to this user. */
    clockodoUserId: v.optional(v.number()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_status", ["status"])
    .index("by_clockodoUserId", ["clockodoUserId"]),

  invites: defineTable({
    email: v.string(),
    role: roleValidator,
    invitedByUserId: v.id("users"),
    token: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("expired")
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  accessRequests: defineTable({
    email: v.string(),
    clerkUserId: v.string(),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied")
    ),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"]),

  // --- Calendar: absences & events ----------------------------------------
  absences: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("vacation"),
      v.literal("sick"),
      v.literal("personal"),
      v.literal("other")
    ),
    startDate: v.string(), // ISO date (YYYY-MM-DD)
    endDate: v.string(),
    halfDay: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("cancelled")
    ),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    // Ingest source. Clockodo is the primary system of record; intranet-filed
    // requests are secondary. Clockodo rows are read-only mirrors.
    source: v.union(v.literal("intranet"), v.literal("clockodo")),
    externalId: v.optional(v.string()), // Clockodo absence id
    clockodoType: v.optional(v.number()),
    clockodoStatus: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_startDate", ["startDate"])
    .index("by_externalId", ["externalId"]),

  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.number(), // epoch ms
    end: v.number(),
    allDay: v.boolean(),
    color: v.optional(v.string()),
    createdByUserId: v.id("users"),
    audience: audienceValidator,
    /** Visible to temporary guest logins on the curated tour. */
    guestVisible: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_start", ["start"]),

  // --- Announcements -------------------------------------------------------
  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    authorUserId: v.id("users"),
    pinned: v.boolean(),
    audience: audienceValidator,
    attachmentStorageIds: v.array(v.id("_storage")),
    /** Visible to temporary guest logins on the curated tour. */
    guestVisible: v.optional(v.boolean()),
    publishedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_publishedAt", ["publishedAt"])
    .index("by_pinned_publishedAt", ["pinned", "publishedAt"]),

  announcementReads: defineTable({
    announcementId: v.id("announcements"),
    userId: v.id("users"),
    readAt: v.number(),
  })
    .index("by_announcement_user", ["announcementId", "userId"])
    .index("by_user", ["userId"]),

  // --- Chat ----------------------------------------------------------------
  conversations: defineTable({
    type: v.union(v.literal("dm"), v.literal("group")),
    name: v.optional(v.string()),
    createdByUserId: v.id("users"),
    lastMessageAt: v.number(),
    /** Sorted, joined member-id key for fast DM lookup (e.g. "id1:id2"). */
    dmKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_dmKey", ["dmKey"]),

  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("owner"), v.literal("member"))),
    lastReadAt: v.number(),
    joinedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_user", ["userId"])
    .index("by_user_conversation", ["userId", "conversationId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderUserId: v.id("users"),
    body: v.string(),
    attachments: v.array(attachmentValidator),
    linkPreviews: v.array(linkPreviewValidator),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

  typing: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_user", ["conversationId", "userId"]),

  // --- Notifications -------------------------------------------------------
  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  presence: defineTable({
    userId: v.id("users"),
    lastActiveAt: v.number(),
  }).index("by_user", ["userId"]),

  // --- Temporary guest logins (tour mode) ---------------------------------
  // Admin-created, token-based, time-boxed read-only access to a curated tour.
  // Fully separate from Clerk employee accounts; never sees sensitive data.
  tempLogins: defineTable({
    label: v.string(),
    email: v.optional(v.string()),
    token: v.string(),
    createdByUserId: v.id("users"),
    expiresAt: v.number(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_status", ["status"]),
});
