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

export const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  kind: v.union(v.literal("image"), v.literal("file")),
  name: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  size: v.optional(v.number()),
  contentType: v.optional(v.string()),
  /**
   * Present when this attachment was imported from OneDrive rather than
   * uploaded locally — the bytes are still copied into Convex storage (so the
   * attachment keeps working even if the drive file moves/is deleted), but
   * these let the UI show its origin and link back to the Files tab.
   */
  oneDriveItemId: v.optional(v.string()),
  oneDrivePath: v.optional(v.string()),
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
    /** Team tags (e.g. "customer-care") controlling guidebook access. */
    teams: v.optional(v.array(v.string())),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    managerId: v.optional(v.id("users")),
    status: v.union(v.literal("active"), v.literal("suspended")),
    /**
     * True when the user's email domain is outside `ALLOWED_EMAIL_DOMAINS`.
     * Externals are full members (their role applies normally); the flag only
     * drives the admin "External" grouping. Set at provisioning time.
     */
    external: v.optional(v.boolean()),
    /** Clockodo coworker id, for linking absence mirrors to this user. */
    clockodoUserId: v.optional(v.number()),
    /**
     * OneDrive: allowlist flag for the Geschäftsführung sub-tree. Access is a
     * dedicated allowlist (admin-managed), NOT tied to manager rank — undefined
     * or false means no access.
     */
    gfAccess: v.optional(v.boolean()),
    /**
     * OneDrive: whether this user may submit upload *requests* (still subject to
     * manager approval). Default-on — undefined is treated as enabled; managers
     * can revoke by setting false.
     */
    uploadRequestsEnabled: v.optional(v.boolean()),
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
    /** True when the invited email is outside the allowed company domains. */
    external: v.optional(v.boolean()),
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
    /** Flat storage ids — kept for cleanup + older rows without rich metadata. */
    attachmentStorageIds: v.array(v.id("_storage")),
    /** Rich attachments (name, kind, type) for newer announcements. */
    attachments: v.optional(v.array(attachmentValidator)),
    /** Visible to temporary guest logins on the curated tour. */
    guestVisible: v.optional(v.boolean()),
    /** May be in the future (scheduled publish) — hidden from non-authors until then. */
    publishedAt: v.number(),
    /** Auto-hides from the feed after this time (author/admin still see it). */
    expiresAt: v.optional(v.number()),
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
    .index("by_announcement", ["announcementId"])
    .index("by_user", ["userId"]),

  announcementReactions: defineTable({
    announcementId: v.id("announcements"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_announcement", ["announcementId"])
    .index("by_announcement_user", ["announcementId", "userId"]),

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
    createdAt: v.number(),
  })
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_dmKey", ["dmKey"])
    .index("by_deleteAt", ["deleteAt"]),

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
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

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
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // Per-user notification preferences. `mutedTypes` holds the raw notification
  // `type` strings the user has opted out of (e.g. "announcement").
  notificationPreferences: defineTable({
    userId: v.id("users"),
    mutedTypes: v.array(v.string()),
    updatedAt: v.number(),
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

  // ========================================================================
  // ActivityTrack — workforce-activity dashboard, ported into the intranet.
  //
  // Single-tenant: ActivityTrack's `organizations`/`users` tables are dropped
  // and identity is reused from the intranet `users` table (people link to it
  // via `userId`). All `orgId` scoping is removed. Generic table names are kept
  // where already specific; `auditLog`/`systemEvents`/`settings` are prefixed
  // `activity*` to avoid colliding with intranet concepts.
  // ========================================================================

  // Physical machines. A device self-registers as "pending" on first run; a
  // manager approves it (status → "active"), which lets it claim its one device
  // token (see activity/deviceAuth.ts) and start ingesting.
  devices: defineTable({
    deviceId: v.string(), // the UUID minted by the agent (ProgramData)
    hostname: v.string(),
    lastWindowsUser: v.string(),
    // Previous account usernames seen on this device, oldest-first, capped to
    // the last 10. Appended on ingest when `lastWindowsUser` changes.
    userHistory: v.optional(
      v.array(v.object({ user: v.string(), changedAt: v.number() }))
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("disabled")
    ),
    personId: v.optional(v.id("people")),
    lastSeen: v.number(),
    agentVersion: v.optional(v.string()),
    // SHA-256 of the agent's one-time pairing nonce, set on register and
    // checked on claim so only the registering machine can claim the token.
    claimNonceHash: v.optional(v.string()),
    // True once the device has claimed its token after approval.
    tokenIssued: v.optional(v.boolean()),
    // SHA-256 of the device's bearer token. Set once on claim, cleared on
    // disable/remove. The raw token is returned exactly once at claim time and
    // never stored. (Self-contained replacement for ActivityTrack's external
    // convex-api-tokens component, so the merge needs no extra Convex component.)
    tokenHash: v.optional(v.string()),
    // Wall-clock time of the last ACCEPTED ingest batch (rate-limit throttle).
    lastIngestAt: v.optional(v.number()),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_status", ["status"])
    .index("by_personId", ["personId"])
    .index("by_tokenHash", ["tokenHash"]),

  // Coworkers being tracked (managed in the dashboard). `userId` links a person
  // to their intranet identity, resolved during migration via `clockodoUserId`
  // or `email`. The external-id fields map a person to the integrated systems.
  people: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    active: v.boolean(),
    employeeId: v.optional(v.string()),
    genesysUserId: v.optional(v.string()),
    clockodoUserId: v.optional(v.string()),
  })
    .index("by_employeeId", ["employeeId"])
    .index("by_genesysUserId", ["genesysUserId"])
    .index("by_clockodoUserId", ["clockodoUserId"])
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  // Raw samples (append-only). Indexed for time-range + per-device queries.
  activitySamples: defineTable({
    deviceId: v.string(),
    windowsUser: v.string(),
    hostname: v.string(),
    idleMs: v.number(),
    active: v.boolean(),
    capturedAt: v.number(),
    receivedAt: v.number(), // server clock, for skew detection
    tzOffsetMinutes: v.number(),
    agentVersion: v.string(),
    platform: v.string(),
  })
    .index("by_device_time", ["deviceId", "capturedAt"])
    .index("by_receivedAt", ["receivedAt"]),

  // Fused employee-state cache: one row per `employeeId`, combining desktop
  // agent + Genesys telephony + Clockodo time-tracking into one state.
  employeeStates: defineTable({
    employeeId: v.string(),

    // Workstation (desktop agent).
    deviceIdle: v.optional(v.boolean()),
    idleSeconds: v.optional(v.number()),
    agentUpdatedAt: v.optional(v.number()),

    // Genesys telephony.
    genesysRoutingStatus: v.optional(
      v.union(
        v.literal("IDLE"),
        v.literal("INTERACTING"),
        v.literal("OFF_QUEUE"),
        v.literal("NOT_RESPONDING")
      )
    ),
    genesysPresence: v.optional(
      v.union(
        v.literal("AVAILABLE"),
        v.literal("BUSY"),
        v.literal("AWAY"),
        v.literal("OFFLINE")
      )
    ),
    genesysWrapUp: v.optional(v.boolean()),
    genesysUpdatedAt: v.optional(v.number()),

    // Clockodo time-tracking.
    clockodoWorking: v.optional(v.boolean()),
    clockodoBreak: v.optional(v.boolean()),
    clockodoAbsent: v.optional(v.boolean()),
    // Assumed "day has ended" (no entry running for over an hour). A guess —
    // corrected back to BREAK if the person clocks in again today — until
    // `clockodoClockedOutCertain` flips true (past the business day-end hour),
    // after which the clock-out is final and never re-labelled.
    clockodoClockedOut: v.optional(v.boolean()),
    clockodoClockedOutCertain: v.optional(v.boolean()),
    // Epoch ms of Clockodo's own last-entry end (the true clock-out instant),
    // used to anchor `finalStateSince` and the state history instead of
    // whenever a poll happened to notice — see `collapseIntoClockedOut`.
    clockodoClockedOutSince: v.optional(v.number()),
    clockodoUpdatedAt: v.optional(v.number()),

    // Engine output.
    finalState: v.union(
      v.literal("ABSENT"),
      v.literal("CLOCKED_OUT"),
      v.literal("BREAK"),
      v.literal("IN_CALL"),
      v.literal("WRAP_UP"),
      v.literal("ACTIVE"),
      v.literal("IDLE")
    ),
    // When `finalState` last *changed* (not merely re-confirmed) — powers the
    // "inactive since 13:42" line on the dashboard.
    finalStateSince: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_employeeId", ["employeeId"]),

  // History of an employee's fused state (insert-on-change). Mostly
  // append-only; the one exception is the CLOCKED_OUT assumption, which is
  // rewritten in place when it is made (BREAK backdated to CLOCKED_OUT) or
  // withdrawn (CLOCKED_OUT corrected to BREAK on a same-day clock-in).
  stateSamples: defineTable({
    employeeId: v.string(),
    state: v.union(
      v.literal("ABSENT"),
      v.literal("CLOCKED_OUT"),
      v.literal("BREAK"),
      v.literal("IN_CALL"),
      v.literal("WRAP_UP"),
      v.literal("ACTIVE"),
      v.literal("IDLE")
    ),
    at: v.number(),
  })
    .index("by_employee_time", ["employeeId", "at"])
    .index("by_at", ["at"]),

  // Quarantine for state transitions the engine refused to write to
  // `stateSamples` — e.g. "working" evidence arriving outside business hours
  // (overnight integration polls, a PC waking at 3 AM for updates). Kept
  // separately so the timeline stays clean while managers can still audit
  // what was rejected and why (the "Discarded" tab).
  discardedStateSamples: defineTable({
    employeeId: v.string(),
    state: v.union(
      v.literal("ABSENT"),
      v.literal("CLOCKED_OUT"),
      v.literal("BREAK"),
      v.literal("IN_CALL"),
      v.literal("WRAP_UP"),
      v.literal("ACTIVE"),
      v.literal("IDLE")
    ),
    /** When the rejected transition would have taken effect (epoch ms). */
    at: v.number(),
    /** Machine-readable rejection reason (e.g. "outside_business_hours"). */
    reason: v.string(),
    /** Signal source that triggered the rejected transition; unset for rows
     * quarantined retroactively by the backfill repair. */
    source: v.optional(
      v.union(v.literal("agent"), v.literal("genesys"), v.literal("clockodo"))
    ),
  })
    .index("by_employee_time", ["employeeId", "at"])
    .index("by_at", ["at"]),

  // Integration health, one row per external source.
  integrationHealth: defineTable({
    source: v.union(v.literal("genesys"), v.literal("clockodo")),
    status: v.union(
      v.literal("ok"),
      v.literal("unavailable"),
      v.literal("unconfigured")
    ),
    message: v.optional(v.string()),
    lastOkAt: v.optional(v.number()),
    lastErrorAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_source", ["source"]),

  // Server-computed daily rollups (active vs idle seconds).
  dailyStats: defineTable({
    deviceId: v.string(),
    day: v.string(), // YYYY-MM-DD in the device's local tz
    activeSeconds: v.number(),
    idleSeconds: v.number(),
    firstSeen: v.number(),
    lastSeen: v.number(),
  })
    .index("by_device_day", ["deviceId", "day"])
    .index("by_day", ["day"]),

  // Append-only audit of privileged dashboard actions.
  activityAuditLog: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    target: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  // Operational error/health events from every surface (deduplicated).
  activitySystemEvents: defineTable({
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("critical")
    ),
    code: v.string(),
    source: v.union(
      v.literal("backend"),
      v.literal("tracker"),
      v.literal("dashboard")
    ),
    message: v.string(),
    deviceId: v.optional(v.string()),
    hostname: v.optional(v.string()),
    context: v.optional(v.string()),
    count: v.number(),
    firstAt: v.number(),
    lastAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_lastAt", ["lastAt"])
    .index("by_open", ["resolvedAt", "code", "deviceId"])
    .index("by_resolvedAt", ["resolvedAt", "lastAt"]),

  // Singleton-ish key/value operational settings, keyed by `key`.
  activitySettings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // --- Data migration tracking (one-time ActivityTrack → advantis import) --
  // One row per migration run.
  activityMigrations: defineTable({
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("paused")
    ),
    startedByUserId: v.optional(v.id("users")),
    note: v.optional(v.string()),
  }).index("by_startedAt", ["startedAt"]),

  // One row per table being migrated, with resume cursor + progress + errors.
  activityMigrationSteps: defineTable({
    migrationId: v.id("activityMigrations"),
    table: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("paused")
    ),
    // Convex pagination cursor for resume (null once exhausted).
    cursor: v.optional(v.union(v.string(), v.null())),
    processed: v.number(),
    total: v.optional(v.number()),
    failed: v.number(),
    // Rows imported but left unlinked (e.g. person with no matching user).
    warnings: v.optional(v.number()),
    lastError: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_migration", ["migrationId"])
    .index("by_migration_table", ["migrationId", "table"]),

  // Maps a source (old-deployment) document id to the freshly-inserted target
  // id, so later steps can resolve references (e.g. a device's `personId`)
  // across the deployment boundary. Idempotent and resumable.
  activityMigrationIdMap: defineTable({
    migrationId: v.id("activityMigrations"),
    sourceTable: v.string(),
    sourceId: v.string(),
    targetId: v.string(),
  }).index("by_migration_source", ["migrationId", "sourceTable", "sourceId"]),

  // --- Onboarding tour progress (for manager visibility) ------------------
  // The tour itself is client-driven; this table is a thin sync record so
  // managers can see other employees' onboarding completion in the admin panel.
  tourProgress: defineTable({
    userId: v.id("users"),
    /** JSON-encoded Record<CheckpointId, CheckpointStatus> */
    checkpointStatuses: v.string(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // --- Guidebook feedback ---------------------------------------------------
  // One "was this helpful?" vote per user per guidebook slug (revisable).
  guidebookFeedback: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    helpful: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user_slug", ["userId", "slug"])
    .index("by_slug", ["slug"]),

  // --- Per-user app preferences ---------------------------------------------
  // One row per user; every field optional so features can add preferences
  // without migrations. Client-side cosmetics (e.g. "always preview") stay in
  // localStorage — this table is for preferences that must follow the user
  // across devices.
  userPreferences: defineTable({
    userId: v.id("users"),
    hiddenDashboardCards: v.optional(v.array(v.string())),
    defaultCalendarView: v.optional(
      v.union(v.literal("month"), v.literal("week"), v.literal("list"))
    ),
    /** App route to land on after sign-in (e.g. "/calendar"). */
    startPage: v.optional(v.string()),
    weekStartsOn: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
    /** AG-root-relative OneDrive folder paths pinned in the file browser. */
    favoriteFolders: v.optional(v.array(v.string())),
    favoriteGuidebooks: v.optional(v.array(v.string())),
    lastGuidebookSlug: v.optional(v.string()),
    /** Release key of the last dismissed "What's new" dialog. */
    dismissedWhatsNew: v.optional(v.string()),
    browserPushEnabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // --- OneDrive integration ------------------------------------------------
  // The intranet is the front page for one OneDrive subscription. Graph holds
  // the bytes; Convex is the system-of-record for *who* uploaded/requested what,
  // approvals/denials, and the suspicious-file scan reports. One row per upload
  // or upload request. Managers' direct uploads also land here (status
  // "approved") so every file in OneDrive traces back to a person.
  onedriveUploads: defineTable({
    requesterUserId: v.id("users"),
    fileName: v.string(),
    size: v.number(),
    contentType: v.string(),
    /** Target folder, AG-root-relative (e.g. "Team/Reports"). */
    targetFolderPath: v.string(),
    /** Convex storage blob holding the bytes while a request is pending. */
    stagingStorageId: v.optional(v.id("_storage")),
    /** JSON-encoded ScanReport from the in-house scanner. */
    scanReport: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("uploading"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    /** Graph driveItem id, set once the bytes land in OneDrive. */
    driveItemId: v.optional(v.string()),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    /** Last error when status is "failed", surfaced to the manager. */
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_user", ["requesterUserId"])
    .index("by_driveItemId", ["driveItemId"]),

  // Append-only audit of OneDrive actions (requests, approvals, deletes, …).
  onedriveAudit: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    target: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  // Singleton store for the delegated-auth (personal Microsoft account) refresh
  // token. Personal-account refresh tokens rotate on every use, so the API
  // persists the latest one here (AES-256-GCM ciphertext, encrypted in the API)
  // to survive redeploys without re-authenticating. One row.
  onedriveAuth: defineTable({
    /** Encrypted refresh token (iv.tag.ciphertext), written by the API. */
    refreshToken: v.string(),
    updatedAt: v.number(),
  }),

  // --- Wiki Chat (AI assistant history) ------------------------------------
  // Per-user chat history for the Wiki AI assistant. Title and message blobs
  // are stored as AES-256-GCM ciphertext (encrypted in the Elysia API with a
  // server-held key); the database never contains plaintext chat content.
  wikiChats: defineTable({
    clerkUserId: v.string(),
    title: v.string(), // ciphertext
    messages: v.string(), // ciphertext (encrypted JSON of the message array)
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["clerkUserId"]),
});
