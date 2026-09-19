import { defineTable } from "convex/server";
import { v } from "convex/values";

import {
  attachmentValidator,
  audienceValidator,
  relevantDateValidator,
  richDateKindValidator,
  suggestionOutcomeValidator,
  suggestionStatusValidator,
} from "../lib/validators";

export const commsTables = {
  // --- Calendar: events ----------------------------------------------------
  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    start: v.number(), // epoch ms
    end: v.number(),
    allDay: v.boolean(),
    kind: v.optional(richDateKindValidator),
    color: v.optional(v.string()),
    createdByUserId: v.id("users"),
    sourceRichDateId: v.optional(v.string()),
    personalForUserId: v.optional(v.id("users")),
    dismissedAt: v.optional(v.number()),
    audience: audienceValidator,
    /** Dead — guest tour removed. Drop after `migrations/dropGuestFields` runs. */
    guestVisible: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_start", ["start"])
    .index("by_personal_rich_date", ["personalForUserId", "sourceRichDateId"])
    .index("by_deletedAt", ["deletedAt"]),

  // --- Announcements -------------------------------------------------------
  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    authorUserId: v.id("users"),
    /** User who owns/manages the post when its visible author is an automation account. */
    ownerUserId: v.optional(v.id("users")),
    pinned: v.boolean(),
    /** Readers are asked to confirm they read it; the author sees who has. */
    requiresAck: v.optional(v.boolean()),
    audience: audienceValidator,
    /** Free-text topic tag (e.g. "Onboarding", "Customer Care") for grouping
     * the feed — admins type or pick from previously-used values, no fixed enum. */
    category: v.optional(v.string()),
    relevantDate: v.optional(relevantDateValidator),
    /** Flat storage ids — kept for cleanup + older rows without rich metadata. */
    attachmentStorageIds: v.array(v.id("_storage")),
    /** Rich attachments (name, kind, type) for newer announcements. */
    attachments: v.optional(v.array(attachmentValidator)),
    /** Dead — guest tour removed. Drop after `migrations/dropGuestFields` runs. */
    guestVisible: v.optional(v.boolean()),
    /** May be in the future (scheduled publish) — hidden from non-authors until then. */
    publishedAt: v.number(),
    /** Auto-hides from the feed after this time (author/admin still see it). */
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    /** Who saved the most recent edit — distinct from `authorUserId` when an
     * admin edits someone else's announcement. */
    updatedByUserId: v.optional(v.id("users")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_publishedAt", ["publishedAt"])
    .index("by_author", ["authorUserId"])
    .index("by_deletedAt", ["deletedAt"]),

  announcementReads: defineTable({
    announcementId: v.id("announcements"),
    userId: v.id("users"),
    readAt: v.number(),
  })
    .index("by_announcement_user", ["announcementId", "userId"])
    .index("by_announcement", ["announcementId"])
    .index("by_user", ["userId"]),

  announcementAcks: defineTable({
    announcementId: v.id("announcements"),
    userId: v.id("users"),
    ackedAt: v.number(),
  })
    .index("by_announcement_user", ["announcementId", "userId"])
    .index("by_announcement", ["announcementId"]),

  announcementReactions: defineTable({
    announcementId: v.id("announcements"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_announcement", ["announcementId"])
    .index("by_announcement_user", ["announcementId", "userId"]),

  // --- Improvement suggestions (Verbesserungsvorschläge) -------------------
  /**
   * Admin-managed taxonomy suggestions are filed under (e.g. "Büro",
   * "Prozess advantis"). Archive, never delete — mirrors `departments`/`teams`
   * so a category referenced by existing `suggestions` rows stays resolvable.
   */
  suggestionCategories: defineTable({
    name: v.string(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }),

  suggestions: defineTable({
    authorUserId: v.id("users"),
    categoryId: v.id("suggestionCategories"),
    title: v.string(),
    explanation: v.optional(v.string()),
    link: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
    status: suggestionStatusValidator,
    outcome: v.optional(suggestionOutcomeValidator),
    decisionNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_outcome", ["outcome"])
    .index("by_deletedAt", ["deletedAt"]),

  /** One row per person backing a suggestion; voters hear when it ships. */
  suggestionVotes: defineTable({
    suggestionId: v.id("suggestions"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_suggestion", ["suggestionId"])
    .index("by_suggestion_user", ["suggestionId", "userId"]),

  // --- Refreshed design preview feedback ------------------------------------
  /** What people think of the refreshed page designs while they're opt-in;
   * read by managers at /admin/design-feedback. Append-only. */
  designFeedback: defineTable({
    userId: v.id("users"),
    sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
    message: v.string(),
    /** The page the person was on when they sent it. */
    path: v.string(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  // --- Updates (incidents / maintenance / changelog) ------------------------
  updates: defineTable({
    type: v.union(v.literal("incident"), v.literal("maintenance"), v.literal("changelog")),
    /** Set by the markdown publish pipeline for idempotent upsert-by-slug. */
    slug: v.optional(v.string()),
    title: v.string(),
    /** Banner text + list excerpt, ~140 chars. */
    summary: v.string(),
    bodyFormat: v.union(v.literal("richtext"), v.literal("markdown")),
    /** Sanitized HTML (richtext) or raw markdown, depending on bodyFormat. */
    body: v.string(),
    authorUserId: v.id("users"),
    audience: audienceValidator,
    /** Dead — guest tour removed. Drop after `migrations/dropGuestFields` runs. */
    guestVisible: v.optional(v.boolean()),
    /** Free-text tags, optionally drawn from a predefined list in the UI. */
    affectedSystems: v.optional(v.array(v.string())),
    status: v.optional(
      v.union(
        // incident
        v.literal("investigating"),
        v.literal("identified"),
        v.literal("monitoring"),
        v.literal("resolved"),
        // maintenance
        v.literal("scheduled"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    timeline: v.optional(
      v.array(
        v.object({
          at: v.number(),
          status: v.optional(v.string()),
          message: v.string(),
          authorUserId: v.id("users"),
        }),
      ),
    ),
    /** Incident/maintenance start, or the changelog's release date. */
    startedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    /** Bumped on every status-changing timeline post; drives dismissal re-surfacing. */
    revision: v.number(),
    /** May be in the future (scheduled publish) — hidden from non-authors until then. */
    publishedAt: v.number(),
    /** Author's "email everyone" choice at publish time. */
    emailRequested: v.boolean(),
    emailSentAt: v.optional(v.number()),
    /** "system" = auto-published by a backend action (e.g. a feature-flag toggle), not an admin authoring a post. */
    source: v.union(v.literal("ui"), v.literal("markdown"), v.literal("system")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_publishedAt", ["publishedAt"])
    .index("by_type_publishedAt", ["type", "publishedAt"])
    .index("by_slug", ["slug"])
    .index("by_deletedAt", ["deletedAt"]),

  /**
   * Per-user banner dismissals. `dismissedRevision` lets a status-changing
   * timeline post (which bumps `updates.revision`) re-surface the banner for
   * someone who already dismissed an earlier state, without a plain edit
   * (e.g. a typo fix) doing the same.
   */
  updateDismissals: defineTable({
    updateId: v.id("updates"),
    userId: v.id("users"),
    dismissedRevision: v.number(),
    dismissedAt: v.number(),
  })
    .index("by_update_user", ["updateId", "userId"])
    .index("by_user", ["userId"]),

  /** Per-recipient Resend delivery/open/click tracking for an update's email blast. */
  updateEmailRecipients: defineTable({
    updateId: v.id("updates"),
    userId: v.id("users"),
    email: v.string(),
    resendEmailId: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("complained"),
      v.literal("failed"),
    ),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    openedAt: v.optional(v.number()),
    clickedAt: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
  })
    .index("by_update", ["updateId"])
    .index("by_resendEmailId", ["resendEmailId"])
    .index("by_update_user", ["updateId", "userId"]),

  /**
   * Global feature kill-switches (see `featureFlags.ts`). One row per key in
   * `FEATURE_FLAG_KEYS`; a missing row means enabled (the default). `reason`
   * is the admin-supplied or premade explanation, reused both for the
   * in-app "disabled" screen and the linked Update post. `updateId` links to
   * the Update created when the flag was last disabled, so re-enabling can
   * post a follow-up on the same post instead of a brand-new one.
   */
  featureFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    reason: v.optional(v.string()),
    updatedAt: v.number(),
    updatedByUserId: v.id("users"),
    updateId: v.optional(v.id("updates")),
  }).index("by_key", ["key"]),
};
