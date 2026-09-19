import { defineTable } from "convex/server";
import { v } from "convex/values";

import { attachmentValidator, linkPreviewValidator } from "../lib/validators";

export const chatTables = {
  // --- Chat ----------------------------------------------------------------
  conversations: defineTable({
    type: v.union(v.literal("dm"), v.literal("group")),
    name: v.optional(v.string()),
    createdByUserId: v.id("users"),
    lastMessageAt: v.number(),
    /** Sorted, joined member-id key for fast DM lookup (e.g. "id1:id2"). */
    dmKey: v.optional(v.string()),
    /** Custom group photo. When unset, the UI shows a member-avatar collage. */
    avatarStorageId: v.optional(v.id("_storage")),
    /** Set when a DM is left by one side; the chat is purged once this passes
     *  (unless the person who left rejoins, which clears it). */
    deleteAt: v.optional(v.number()),
    /** Preview text for the sidebar, maintained by sendMessage/deleteMessage
     *  on the same patch that already sets lastMessageAt — so listConversations
     *  can read it off the conversation row it's already loading instead of a
     *  separate `messages.order("desc").first()` query per conversation. */
    lastMessagePreview: v.optional(v.string()),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_dmKey", ["dmKey"])
    .index("by_deleteAt", ["deleteAt"])
    .index("by_avatarStorageId", ["avatarStorageId"])
    .index("by_deletedAt", ["deletedAt"]),

  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("owner"), v.literal("member"))),
    lastReadAt: v.number(),
    joinedAt: v.number(),
    /** Defensive marker; a left DM member row is normally deleted outright. */
    leftAt: v.optional(v.number()),
    /** Per-user conversation controls. */
    pinnedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    mutedAt: v.optional(v.number()),
    /** Unread message count, incremented by sendMessage for every member but
     *  the sender and reset by markRead — replaces a `.take(50)` scan of
     *  `messages` per conversation on every listConversations execution.
     *  Undefined reads as 0 (pre-migration rows / never-messaged members). */
    unreadCount: v.optional(v.number()),
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
    /** Message this one is a reply to (quote preview in the UI). */
    replyToId: v.optional(v.id("messages")),
    /** Users @mentioned in this message (groups). */
    mentions: v.optional(v.array(v.id("users"))),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    pinnedAt: v.optional(v.number()),
    pinnedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_pinnedAt", ["conversationId", "pinnedAt"])
    .index("by_sender", ["senderUserId"]),

  /** Who uploaded a file, recorded by the client right after uploading.
   *  Storage itself doesn't know, and `files.deleteFile` only lets the
   *  uploader roll a file back. Pruned after a week. */
  uploadClaims: defineTable({
    storageId: v.id("_storage"),
    userId: v.id("users"),
    at: v.number(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_at", ["at"]),
  /**
   * Reverse index from an attachment's storage id to whatever owns it
   * (a chat message or an announcement), maintained on every write that adds
   * an attachment. `files.canAccessFile` used to resolve a shared file link
   * by scanning every message (and every announcement) ever created org-wide
   * — unbounded, and only getting slower as chat history grows. This makes
   * that an indexed point lookup instead; the full scan stays as a fallback
   * for rows written before this index existed (see the comment on
   * canAccessFile), so a missed write path degrades to "slow" rather than
   * "wrong". Not deduped on edit/re-save — a duplicate row for the same
   * (storageId, owner) is harmless, since canAccessFile only needs "at least
   * one row exists".
   */
  attachmentOwners: defineTable({
    storageId: v.id("_storage"),
    kind: v.union(v.literal("message"), v.literal("announcement"), v.literal("suggestion")),
    conversationId: v.optional(v.id("conversations")),
    announcementId: v.optional(v.id("announcements")),
    suggestionId: v.optional(v.id("suggestions")),
  }).index("by_storageId", ["storageId"]),

  messageReactions: defineTable({
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user", ["messageId", "userId"]),

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
    /** Hidden until then, when it comes back unread at the top. */
    snoozedUntil: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // Per-user notification preferences. `mutedTypes` holds the raw notification
  // `type` strings the user has opted out of (e.g. "announcement").
  notificationPreferences: defineTable({
    userId: v.id("users"),
    mutedTypes: v.array(v.string()),
    /** One morning email listing yesterday's unread notifications. */
    dailyDigest: v.optional(v.boolean()),
    /** Managers: a Monday email on how last week compared to the one before. */
    weeklyReport: v.optional(v.boolean()),
    lastDigestAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_dailyDigest", ["dailyDigest"]),

  presence: defineTable({
    userId: v.id("users"),
    lastActiveAt: v.number(),
  }).index("by_user", ["userId"]),

  // Dead: the guest tour is gone. Kept declared only so
  // `migrations/dropGuestFields` can empty it — drop this table and the
  // `guestVisible` fields above once that has run.
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
};
