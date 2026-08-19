import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared validators -----------------------------------------------------------

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee"),
);

/**
 * Scoped permissions a custom role (see `customRoles` table) can grant on top
 * of a user's base `role` tier. Additive only — a capability never revokes
 * anything the base tier already allows.
 */
export const capabilityValidator = v.union(
  v.literal("manage_members"),
  v.literal("access_integrations"),
  v.literal("access_files"),
  v.literal("manage_uploads"),
  v.literal("view_activity_admin"),
  v.literal("manage_announcements"),
  v.literal("manage_guidebooks"),
  v.literal("manage_blog"),
  v.literal("manage_it_ticket_threads"),
  v.literal("view_clockodo_team"),
  v.literal("manage_clockodo_team"),
);

// --- Applicant Management (Bewerbermanagement) validators -------------------

export const ampelValidator = v.union(v.literal("rot"), v.literal("blau"), v.literal("gruen"));

export const kontaktArtValidator = v.union(
  v.literal("telefon"),
  v.literal("email"),
  v.literal("persoenlich"),
  v.literal("video"),
  v.literal("sonstiges"),
);

export const emailKategorieValidator = v.union(
  v.literal("telefonisch_nicht_erreicht"),
  v.literal("einladung"),
  v.literal("absage"),
  v.literal("sonstiges"),
);

export const terminArtValidator = v.union(
  v.literal("telefon"),
  v.literal("teams"),
  v.literal("vor_ort"),
);

export const terminTypValidator = v.union(
  v.literal("interview"),
  v.literal("gespraech"),
  v.literal("probetag"),
  v.literal("wiedervorlage"),
  v.literal("sonstiges"),
);

/** Who an event/announcement targets. */
export const audienceValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("department"), department: v.string() }),
  v.object({
    kind: v.literal("departmentId"),
    departmentId: v.id("departments"),
  }),
  v.object({ kind: v.literal("users"), userIds: v.array(v.id("users")) }),
  /** Additive: reaches anyone in *any* of `departments` plus anyone listed
   *  individually in `userIds` — lets an author combine "Sales" with a couple
   *  of specific people from other departments in one audience. */
  v.object({
    kind: v.literal("mixed"),
    departments: v.array(v.string()),
    userIds: v.array(v.id("users")),
  }),
);

export const richDateKindValidator = v.union(
  v.literal("event"),
  v.literal("deadline"),
  v.literal("reminder"),
);

export const relevantDateValidator = v.object({
  id: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  allDay: v.boolean(),
  kind: v.optional(richDateKindValidator),
  description: v.optional(v.string()),
  location: v.optional(v.string()),
});

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

export const suggestionStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_discussion"),
  v.literal("implementing"),
  v.literal("closed"),
);

export const suggestionOutcomeValidator = v.union(
  v.literal("withdrawn"),
  v.literal("not_possible"),
  v.literal("implemented"),
);

/**
 * The areas guarded by a password of their own, outside Clerk — the `o=`
 * value in the shared `/password?o=<scope>&token=…` reset link, and the
 * discriminant on `passwordResetRequests`/`passwordResetTokens`. Add a new
 * literal here (plus a branch in `passwordResets.ts`'s `resolveTarget` /
 * `applyNewPassword`) when a third area grows its own password; nothing else
 * about the flow is per-area.
 */
export const passwordResetScopeValidator = v.union(v.literal("hr"), v.literal("performance"));

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

  // --- Intranet: identity & access ----------------------------------------
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: roleValidator,
    /** Temporary, read-only role view selected by an administrator. */
    sandboxRole: v.optional(v.union(v.literal("manager"), v.literal("employee"))),
    /**
     * Legacy free-text department (unvalidated). Superseded by `departmentId`
     * — see `departments` table. Kept only so already-written rows keep
     * resolving until the org-data migration backfills every user's
     * `departmentId` and the read paths cut over; do not write this field in
     * new code.
     */
    department: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    /** Canonical department link — see `departments` table. */
    departmentId: v.optional(v.id("departments")),
    phone: v.optional(v.string()),
    /**
     * Legacy free-text team tags (e.g. "customer-care") controlling guidebook
     * access. Superseded by the `userTeams` join table — see `teams`. Kept
     * only until the org-data migration backfills `userTeams`; do not write
     * this field in new code.
     */
    teams: v.optional(v.array(v.string())),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    profileColor: v.optional(v.string()),
    profileGradient: v.optional(
      v.union(
        v.literal("aurora"),
        v.literal("ocean"),
        v.literal("sunset"),
        v.literal("violet"),
        v.literal("rose"),
      ),
    ),
    managerId: v.optional(v.id("users")),
    status: v.union(v.literal("active"), v.literal("suspended")),
    /**
     * True when the user's email domain is outside `ALLOWED_EMAIL_DOMAINS`.
     * Externals are full members (their role applies normally); the flag only
     * drives the admin "External" grouping. Set at provisioning time.
     */
    external: v.optional(v.boolean()),
    /**
     * Clockodo coworker id, for linking absence mirrors to this user.
     * Canonical type is `string` (matching `people.clockodoUserId` and
     * Clockodo's own API) — this field temporarily accepts `v.union(v.string(),
     * v.number())` to stay backward-compatible with any pre-existing rows
     * still holding a `number`. All writers now write `string`. Once a
     * one-time backfill (`orgDataMigration.backfillClockodoUserIdStrings`)
     * confirms no `number` rows remain in production, narrow this back to
     * `v.optional(v.string())` and delete the backfill + the
     * `toClockodoIdNumber`/legacy-number-read paths.
     */
    clockodoUserId: v.optional(v.union(v.string(), v.number())),
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
    /**
     * OneDrive: Graph permission id for this user's direct read-only share on
     * the Team folder (granted via `/invite`, not tied to the intranet's own
     * FileBrowser access control). Undefined means not directly shared yet.
     */
    oneDrivePermissionId: v.optional(v.string()),
    /**
     * Manager-defined roles (e.g. "Team Lead", "Integrations Access") granting
     * extra capabilities on top of `role` — see `customRoles`. Additive, not a
     * replacement for the admin/manager/employee tier. A user can hold more
     * than one at once; an empty/missing array means none. All reads go
     * through `lib/auth.ts`'s `effectiveCustomRoleIds`, which falls back to
     * the legacy `customRoleId` below for rows `migrations/
     * backfillCustomRoleIds.ts` hasn't reached yet.
     */
    customRoleIds: v.optional(v.array(v.id("customRoles"))),
    /** @deprecated superseded by `customRoleIds` (plural). Kept only so
     * not-yet-migrated rows keep validating; new writes never set this. */
    customRoleId: v.optional(v.id("customRoles")),
    /**
     * Applicant Management: admin-only allowlist flag letting this user grant
     * or revoke `applicantAccess` for others (on top of the admin tier, which
     * always can). Mirrors the `gfAccess` allowlist pattern — a dedicated
     * grant, not tied to manager rank.
     */
    applicantAccessDelegate: v.optional(v.boolean()),
    /** Applicant Management: whether this user can see/edit applicant records. */
    applicantAccess: v.optional(v.boolean()),
    /**
     * Cosmetic per-user display override for the role name (e.g. rendering
     * "Geschäftsführerin" instead of "Admin"). Purely a label — never read for
     * permission checks, which always use `role`.
     */
    roleLabel: v.optional(v.string()),
    /**
     * Explicit opt-in to receive "Updates" broadcast emails. Only meaningful
     * for `external` users — internal employees are always eligible and this
     * flag is ignored for them. Externals default to *not* eligible
     * (undefined/false) until they opt in from Settings; see
     * `users.setUpdatesEmailConsent` and the filter in `updatesEmail.sendBulk`.
     */
    updatesEmailConsent: v.optional(v.boolean()),
    /**
     * Self-editable, "YYYY-MM-DD". Only ever surfaced to others when
     * `showBirthdayPublicly` is true — see `users.todaysCelebrations`.
     */
    dateOfBirth: v.optional(v.string()),
    /** Opt-in: show `dateOfBirth` (day/month only) to the rest of the org. */
    showBirthdayPublicly: v.optional(v.boolean()),
    webauthnUserId: v.optional(v.string()),
    /**
     * "YYYY-MM-DD", editable only by Managers+ (see `users.setHireDate`) —
     * drives the overview's work-anniversary shoutouts.
     */
    hireDate: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_createdAt", ["createdAt"])
    .index("by_role", ["role"])
    .index("by_status", ["status"])
    .index("by_clockodoUserId", ["clockodoUserId"])
    .index("by_avatarStorageId", ["avatarStorageId"])
    .index("by_managerId", ["managerId"]),

  passkeys: defineTable({
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.optional(
      v.array(
        v.union(
          v.literal("ble"),
          v.literal("cable"),
          v.literal("hybrid"),
          v.literal("internal"),
          v.literal("nfc"),
          v.literal("smart-card"),
          v.literal("usb"),
        ),
      ),
    ),
    deviceType: v.union(v.literal("singleDevice"), v.literal("multiDevice")),
    backedUp: v.boolean(),
    name: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_credentialId", ["credentialId"]),

  passkeyChallenges: defineTable({
    flowId: v.string(),
    challenge: v.string(),
    kind: v.union(v.literal("registration"), v.literal("authentication")),
    userId: v.optional(v.id("users")),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_flowId", ["flowId"])
    .index("by_expiresAt", ["expiresAt"]),

  passkeyAuditLog: defineTable({
    userId: v.id("users"),
    passkeyId: v.optional(v.id("passkeys")),
    event: v.union(
      v.literal("created"),
      v.literal("used"),
      v.literal("renamed"),
      v.literal("removed"),
    ),
    at: v.number(),
  })
    .index("by_user_at", ["userId", "at"])
    .index("by_passkey", ["passkeyId"]),

  /**
   * Canonical org departments. Replaces the free-text `users.department` —
   * see the org-data migration (`orgDataMigration.ts`) that backfills
   * `users.departmentId` from the legacy string values.
   */
  departments: defineTable({
    name: v.string(),
    /** Reserved for a future org-chart phase; unused by today's logic. */
    parentId: v.optional(v.id("departments")),
    /** Soft delete — archived departments stay resolvable for old records. */
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }),

  /**
   * Canonical teams (access-control tags, e.g. "customer-care"). Replaces
   * the free-text `users.teams` array — membership lives in `userTeams`.
   * `slug` is kept stable across renames so existing guidebook access rules
   * that reference a team by slug don't break.
   */
  teams: defineTable({
    name: v.string(),
    slug: v.string(),
    colorKey: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }).index("by_slug", ["slug"]),

  /**
   * users <-> teams membership. A join table rather than an id array on
   * `users` because Convex has no array-contains index — this lets "who is
   * on team X" resolve via `by_team` instead of scanning every user.
   */
  userTeams: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
  })
    .index("by_user", ["userId"])
    .index("by_user_team", ["userId", "teamId"]),

  /**
   * Review queue for the one-time org-data migration that replaces the
   * free-text `users.department`/`users.teams` with `departments`/`teams`
   * rows. One row per normalized (trim + lowercase) raw value bucket found
   * across `users` — an admin renames/merges/rejects buckets here before
   * `orgDataMigration.runBackfill` is allowed to create real rows from them,
   * so two spellings of the same department never get silently merged (or
   * kept separate) without a human deciding.
   */
  orgDataMigrationReview: defineTable({
    kind: v.union(v.literal("department"), v.literal("team")),
    /** `raw.trim().toLowerCase()` — the grouping key. */
    normalized: v.string(),
    /** Every distinct raw string seen for this bucket, for the reviewer. */
    rawValues: v.array(v.string()),
    /** Editable canonical label; defaults to the first raw value seen. */
    canonicalName: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    /** Set when this bucket was merged into another; excluded from backfill
     *  on its own — the target bucket's row covers its users too. */
    mergedIntoId: v.optional(v.id("orgDataMigrationReview")),
    /** Set once `runBackfill` has created the real row for this bucket. */
    materializedDepartmentId: v.optional(v.id("departments")),
    materializedTeamId: v.optional(v.id("teams")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_kind_normalized", ["kind", "normalized"])
    .index("by_status", ["status"]),

  /** Manager-defined roles (e.g. "Team Lead") granting a set of capabilities. */
  customRoles: defineTable({
    name: v.string(),
    capabilities: v.array(capabilityValidator),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }),

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
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
    // Optional pre-filled profile fields set by the inviter (the
    // personal-email onboarding flow at /admin/onboard) — applied to the
    // new `users` row and `userTeams` in `ensureUser`'s invite branch once
    // the invite is accepted. Left unset by the plain email+role invite
    // path (/admin/invites), where these stay self-service on first login.
    departmentId: v.optional(v.id("departments")),
    teamIds: v.optional(v.array(v.id("teams"))),
    jobTitle: v.optional(v.string()),
    phone: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  accessRequests: defineTable({
    email: v.string(),
    clerkUserId: v.string(),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_createdAt", ["createdAt"]),

  // --- Calendar: absences & events ----------------------------------------
  /**
   * Deprecated: absences are no longer mirrored here. Clockodo is fetched
   * live via apps/api on every read instead (see AGENTS.md's Clockodo
   * section) — nothing writes to this table anymore. Left declared rather
   * than dropped so old rows aren't orphaned from the schema; safe to
   * actually remove once confirmed nothing needs the historical rows.
   */
  absences: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("vacation"),
      v.literal("sick"),
      v.literal("personal"),
      v.literal("other"),
    ),
    startDate: v.string(), // ISO date (YYYY-MM-DD)
    endDate: v.string(),
    halfDay: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("cancelled"),
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
  })
    .index("by_start", ["start"])
    .index("by_personal_rich_date", ["personalForUserId", "sourceRichDateId"]),

  // --- Announcements -------------------------------------------------------
  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    authorUserId: v.id("users"),
    /** User who owns/manages the post when its visible author is an automation account. */
    ownerUserId: v.optional(v.id("users")),
    pinned: v.boolean(),
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
  }).index("by_publishedAt", ["publishedAt"]),

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
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_outcome", ["outcome"]),

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
  })
    .index("by_publishedAt", ["publishedAt"])
    .index("by_type_publishedAt", ["type", "publishedAt"])
    .index("by_slug", ["slug"]),

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
  })
    .index("by_dmKey", ["dmKey"])
    .index("by_deleteAt", ["deleteAt"])
    .index("by_avatarStorageId", ["avatarStorageId"]),

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
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

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

  // --- Performance (sales KPI dashboard) -----------------------------------
  // Multi-tenant: each client company brings its own, fully independent
  // domain (e.g. "salespirates.de") — there is no Advantis-owned wildcard
  // root. `companies.ts` adds that domain to the Vercel project via the
  // Domains API on creation; Vercel then reports the DNS record(s)
  // (`dnsVerification`) the domain's owner must add on their own registrar
  // before it verifies — one manual step per company, unavoidable since
  // nobody can write into a DNS zone they don't control, not a gap in the
  // automation. Everything else (the company row, its built-in roles, the
  // Vercel API call itself) is zero-touch.
  companies: defineTable({
    name: v.string(),
    // Internal identifier only (session/self-setup scoping) — auto-derived
    // from `domain` at creation time, never itself used for routing.
    slug: v.string(),
    // The company's own domain, exact-matched against the request Host
    // header (`companies.getByDomain`) — e.g. "salespirates.de" or
    // "app.salespirates.de". Whatever they actually point at Vercel.
    domain: v.string(),
    status: v.union(
      v.literal("provisioning"), // row just created, about to call Vercel
      v.literal("pending_dns"), // added to Vercel, waiting on the owner's ownership-verification DNS record
      v.literal("pending_routing"), // ownership verified, but no A/CNAME actually routes traffic to Vercel yet
      v.literal("active"), // ownership verified AND traffic correctly routed — actually live
      v.literal("failed"), // a real error (not just "not verified yet")
    ),
    // Per-company replacement for the old global `PERFORMANCE_ADMIN_EMAILS`
    // env var — the emails that can self-claim this company's built-in Admin
    // role via `setupAccount`, set once at creation time.
    adminBootstrapEmails: v.array(v.string()),
    // The ownership-verification TXT record Vercel reports is still needed
    // — shown verbatim in the admin UI so whoever owns the domain knows
    // exactly what to add. Proves domain ownership; does NOT by itself mean
    // traffic actually reaches Vercel (see `dnsRouting`).
    dnsVerification: v.optional(
      v.array(v.object({ type: v.string(), domain: v.string(), value: v.string() })),
    ),
    // The A/CNAME record Vercel's domain-config check recommends — the
    // second, separate step after ownership verification: without this,
    // the domain can show `verified: true` while still not resolving to
    // Vercel at all (`misconfigured: true`), which is a real, observed
    // failure mode this field exists to fix, not a redundant check.
    dnsRouting: v.optional(v.array(v.object({ type: v.string(), value: v.string() }))),
    // Best-effort hint (nameserver-based, not authoritative) for which DNS
    // provider actually manages this domain's records — shown as "add it at
    // <provider>" plus a docs link so whoever owns the domain doesn't have
    // to hunt for their own registrar's instructions. Kept even once
    // `active` (re-detected on every `createCompany`/`checkDomainVerification`
    // call, so it can still go stale between calls, but never disappears
    // just because the domain finished verifying).
    dnsProvider: v.optional(v.object({ name: v.string(), docsUrl: v.string() })),
    vercelVerified: v.optional(v.boolean()),
    provisioningError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_domain", ["domain"])
    .index("by_status", ["status"]),

  // Named bundles of permission keys (`performance/lib/permissions.ts`),
  // scoped per company — the customization layer letting a company's own
  // admin (or a cross-company `isSuperAdmin`) reshape who-can-do-what
  // without a code change. Every company is seeded with three built-ins
  // (Admin, Team Lead, Mitarbeiter) on creation; `isBuiltIn` rows stay
  // editable — e.g. a company can narrow "Team Lead" below its
  // Admin-equivalent default at any time — just not deletable, so a company
  // can never end up with zero usable roles.
  companyRoles: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    permissions: v.array(v.string()),
    isBuiltIn: v.boolean(),
    createdAt: v.number(),
  }).index("by_company", ["companyId"]),

  // Password-protected area, fully separate from Clerk employee accounts.
  // `linkedUserId` lets an admin link a login to its owner's intranet
  // (Clerk) account — see `performanceAuth.ts`'s `resolveActiveSession`,
  // which then authenticates that person from their existing Clerk session
  // instead of a separate password, mirroring how `people.userId` links a
  // person record to its account. The password login stays fully
  // functional either way (admins, and any not-yet-linked employee).
  performanceLogins: defineTable({
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    // Deprecated: superseded by `companyId`/`roleId`/`isSuperAdmin` below.
    // Kept optional (not removed) only until
    // `migrations/backfillPerformanceCompanyId.ts` has re-derived every
    // row's `roleId` from it — safe to delete this field once that's
    // confirmed complete.
    role: v.optional(v.union(v.literal("admin"), v.literal("mitarbeiter"))),
    // Absent only for `isSuperAdmin` logins — every company member belongs
    // to exactly one company.
    companyId: v.optional(v.id("companies")),
    // Absent only for `isSuperAdmin` logins; otherwise required, and must
    // reference a `companyRoles` row belonging to the same `companyId` (see
    // `performanceAuth.ts`'s `requirePermission`).
    roleId: v.optional(v.id("companyRoles")),
    // Platform-level, cross-company — bypasses every company/permission
    // check, including for companies that don't exist yet at the time it's
    // granted. Bootstrapped via the `PERFORMANCE_SUPER_ADMIN_EMAILS` env
    // var; never assignable through the per-company roles UI.
    isSuperAdmin: v.optional(v.boolean()),
    employeeId: v.optional(v.id("performanceEmployees")),
    linkedUserId: v.optional(v.id("users")),
    active: v.boolean(),
    createdAt: v.number(),
  })
    // Global lookup, still needed for `isSuperAdmin` logins (no companyId to
    // scope by). Company-scoped logins are looked up via `by_company_email`
    // instead — email uniqueness is per-company, not global.
    .index("by_email", ["email"])
    .index("by_company_email", ["companyId", "email"])
    .index("by_linkedUserId", ["linkedUserId"]),

  performanceSessions: defineTable({
    token: v.string(),
    loginId: v.id("performanceLogins"),
    // Denormalized from `performanceLogins.companyId` at creation time
    // (absent for a super-admin session) so session-gated calls don't need
    // an extra `ctx.db.get(loginId)` for the common case.
    companyId: v.optional(v.id("companies")),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_token", ["token"])
    // Needed to drop every session of one login at once — a password reset
    // must not leave the sessions issued under the old password alive.
    .index("by_login", ["loginId"]),

  // Sales-team roster for the Performance feature; rows are created on first
  // report import (added in a later phase — this table exists now so
  // `performanceLogins.employeeId` can reference it).
  performanceEmployees: defineTable({
    name: v.string(),
    active: v.boolean(),
    companyId: v.optional(v.id("companies")),
  })
    .index("by_company", ["companyId"])
    .index("by_company_name", ["companyId", "name"]),

  // Backfilled nightly (see crons.ts's `cacheCompletedMonthBadges`) with one
  // row per completed month once its badges are computed. A completed
  // month's underlying reports never change (see the "historical data
  // doesn't change once reported" convention on `performanceReports`), so
  // once a row exists here it's permanent — reading it lets
  // `performanceQueries.allBadgesMap` skip recomputing that month's team
  // totals from scratch on every request.
  performanceBadgeCache: defineTable({
    companyId: v.optional(v.id("companies")),
    ym: v.string(),
    badges: v.record(v.string(), v.object({ value: v.number(), winners: v.array(v.string()) })),
    computedAt: v.number(),
  })
    .index("by_ym", ["ym"])
    .index("by_company_ym", ["companyId", "ym"]),

  // One row per employee per report day. Metric columns are nullable —
  // null means "not measured in this snapshot", not zero — so a report
  // that only covers some metrics (e.g. a call report on a day with no
  // Salesforce export) never overwrites the others with a false zero.
  // `reportDate` is an ISO "YYYY-MM-DD" string so lexicographic and
  // chronological order coincide for range queries.
  performanceReports: defineTable({
    employeeId: v.id("performanceEmployees"),
    companyId: v.optional(v.id("companies")),
    reportDate: v.string(),
    leadsCreated: v.optional(v.number()),
    workableCreated: v.optional(v.number()),
    leadsAnalysis: v.optional(v.number()),
    leadsDetailsIdent: v.optional(v.number()),
    oppsOpen: v.optional(v.number()),
    oppsClose7d: v.optional(v.number()),
    oppsPending: v.optional(v.number()),
    wonMonth: v.optional(v.number()),
    callsToday: v.optional(v.number()),
    overduesAnalysis: v.optional(v.number()),
    overduesOpps: v.optional(v.number()),
    oppsOver30: v.optional(v.number()),
    leadsNoAction14: v.optional(v.number()),
    oppsNoAction14: v.optional(v.number()),
    callsAnswered: v.optional(v.number()),
    callsOutbound: v.optional(v.number()),
    talkTotalSec: v.optional(v.number()),
    talkAvgSec: v.optional(v.number()),
    loginSec: v.optional(v.number()),
    unqualifiedReasons: v.optional(v.string()),
    sourceFile: v.string(),
    uploadedAt: v.number(),
  })
    .index("by_employee_date", ["employeeId", "reportDate"])
    .index("by_reportDate", ["reportDate"])
    .index("by_company_reportDate", ["companyId", "reportDate"]),

  // Drill-down rows for the currently-open Salesforce leads/opportunities.
  // Replaced wholesale on every Salesforce import (the source report is
  // itself a full point-in-time snapshot, not a delta) rather than
  // accumulated — old rows would otherwise describe leads/opps that may no
  // longer be open.
  performanceRawLeads: defineTable({
    companyId: v.optional(v.id("companies")),
    reportDate: v.string(),
    owner: v.string(),
    status: v.optional(v.string()),
    statusDetails: v.optional(v.string()),
    createDate: v.optional(v.string()),
    lastActivity: v.optional(v.string()),
  })
    // Powers the Team tab's "daily logged-in employees" chart (distinct
    // owners with a lead created that day) — an indexed range scan instead
    // of a full-table collect.
    .index("by_createDate", ["createDate"])
    .index("by_company_createDate", ["companyId", "createDate"])
    // `drilldown`'s per-employee view (a `mitarbeiter` login, or an admin
    // drilling into one name) otherwise reads every open lead in the table
    // just to filter to one owner in memory. Company-first so the scan
    // never crosses tenants for a same-named owner.
    .index("by_company_owner", ["companyId", "owner"]),

  performanceRawOpps: defineTable({
    companyId: v.optional(v.id("companies")),
    reportDate: v.string(),
    owner: v.string(),
    stage: v.optional(v.string()),
    stageDetails: v.optional(v.string()),
    createdDate: v.optional(v.string()),
    closeDate: v.optional(v.string()),
    age: v.optional(v.number()),
    lastActivity: v.optional(v.string()),
    customerNumber: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_company_owner", ["companyId", "owner"]),

  // One row per closed-won opportunity, keyed by its actual Close Date —
  // powers the daily closed-won trend chart. `wonMonth` on
  // `performanceReports` is a cumulative month-to-date counter meant to be
  // diffed across daily uploads, which produced a single lump-sum spike on
  // whatever day an opp report happened to be uploaded when uploads aren't
  // daily. This table sidesteps that entirely by reading the real per-
  // opportunity close date out of the export. Replaced wholesale on every
  // Opportunity import, same rationale as `performanceRawOpps`.
  performanceWonOpps: defineTable({
    companyId: v.optional(v.id("companies")),
    owner: v.string(),
    closeDate: v.string(),
  })
    .index("by_closeDate", ["closeDate"])
    .index("by_company_closeDate", ["companyId", "closeDate"]),

  // One row per employee per Genesys interaction (raw, not aggregated) —
  // imported from the "Interaktionen" export, distinct from the aggregated
  // Genesys agent report `performanceReports.callsToday`/etc. already cover.
  // An interaction with several participating agents (transfer/conference)
  // produces one row per matched employee, since each of them genuinely
  // handled it. `date` is the calendar day of `startedAt` (ISO
  // "YYYY-MM-DD", UTC) — kept alongside the timestamp so day-scoped queries
  // can use an index instead of re-deriving the date from every row.
  // Wholesale-replaced per calendar month on import (see
  // `interactionImport.ts`), same rationale as `performanceRawLeads`/`Opps`.
  performanceInteractions: defineTable({
    employeeId: v.id("performanceEmployees"),
    companyId: v.optional(v.id("companies")),
    date: v.string(),
    startedAt: v.number(),
    durationSec: v.number(),
    direction: v.optional(v.string()),
    sourceFile: v.string(),
    uploadedAt: v.number(),
  })
    .index("by_employee_date", ["employeeId", "date"])
    .index("by_date", ["date"])
    .index("by_company_date", ["companyId", "date"]),

  // Admin-set monthly goals/todos for an employee. Status can be updated by
  // the employee themself; only an admin can create/edit/delete the topic
  // itself.
  performanceTopics: defineTable({
    employeeId: v.id("performanceEmployees"),
    ym: v.string(),
    topic: v.string(),
    todo: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.union(v.literal("offen"), v.literal("erreicht"), v.literal("nicht_erreicht")),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_employee_ym", ["employeeId", "ym"]),

  performanceUploadLog: defineTable({
    companyId: v.optional(v.id("companies")),
    // Raw original filename — never a composed/decorated label, so the UI
    // can show it in full instead of parsing detail back out of a string.
    filename: v.string(),
    storageId: v.id("_storage"),
    rowsImported: v.number(),
    uploadedAt: v.number(),
    // SHA-256 of the raw file bytes, computed by apps/api before staging —
    // lets apiImportReport recognize a re-upload of an already-imported
    // file (any report type) and skip re-processing it instead of silently
    // re-running an import that would just overwrite identical data.
    contentHash: v.optional(v.string()),
    // What kind of report this was detected as — drives the badge/icon in
    // the upload log instead of the old baked-in-string description.
    reportKind: v.optional(
      v.union(
        v.literal("lead"),
        v.literal("opp"),
        v.literal("call"),
        v.literal("template"),
        v.literal("interactions"),
      ),
    ),
    // The report's own date (YYYY-MM-DD), as detected from its content —
    // not the upload time. Undefined for the aggregated template, which
    // spans multiple days itself.
    reportDate: v.optional(v.string()),
    // Total data rows in the source file, before any team-matching filter
    // — lets the UI show "40 of 41 matched" instead of just the imported
    // count.
    sourceRowCount: v.optional(v.number()),
    // Call-report agent names that didn't match a known team member —
    // previously only ever shown in the upload queue's toast for that one
    // session, never persisted for later reference in the log.
    skippedNames: v.optional(v.array(v.string())),
    fileSize: v.optional(v.number()),
    // Client-generated id shared by every file selected/dropped in the
    // same batch — lets the upload log show "17 files uploaded together"
    // instead of 17 unrelated-looking rows with the same timestamp.
    batchId: v.optional(v.string()),
    // Display name (falling back to email) of the admin who uploaded this
    // file, resolved from their Performance session by apps/api at upload
    // time — undefined for rows written before this existed, and preserved
    // across a re-import (`replaceLogId`) rather than being overwritten by
    // whichever admin happened to click "re-import".
    uploadedBy: v.optional(v.string()),
    // Set once the browser has downloaded this call report and re-checked
    // it client-side for the implausible-duration cells the parser now
    // catches on import (see `performanceFlaggedRows`) — a file uploaded
    // before that check existed never ran it. Client-side, not a Convex
    // action, so re-checking years of history doesn't burn function time;
    // only the (small) set of found flags gets written back.
    scannedForFlags: v.optional(v.boolean()),
  })
    .index("by_uploadedAt", ["uploadedAt"])
    .index("by_contentHash", ["contentHash"])
    .index("by_batchId", ["batchId"])
    .index("by_company_uploadedAt", ["companyId", "uploadedAt"])
    // Duplicate-upload detection must be per-company — two different client
    // companies could upload files with identical bytes/hash by coincidence
    // (e.g. the blank template).
    .index("by_company_contentHash", ["companyId", "contentHash"]),

  // A single employee/day/field whose parsed duration failed the physical
  // 24h plausibility check (see callImport.ts's `capExplicitDuration`) gets
  // excluded from `performanceReports` and parked here instead of being
  // silently dropped — an admin reviews the source cell and either edits in
  // a corrected value, ignores it, or force-imports the raw parsed value.
  // Re-importing the same bad cell refreshes a still-`pending` row in place
  // rather than duplicating it; a row already `ignored`/`resolved` for the
  // exact same raw value is left alone so a routine re-import can't
  // silently undo an admin's earlier call.
  performanceFlaggedRows: defineTable({
    employeeId: v.id("performanceEmployees"),
    companyId: v.optional(v.id("companies")),
    reportDate: v.string(),
    field: v.union(v.literal("talkTotalSec"), v.literal("talkAvgSec"), v.literal("loginSec")),
    rawSeconds: v.number(),
    rawText: v.string(),
    sourceFile: v.string(),
    uploadedAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("ignored"), v.literal("resolved")),
    resolvedAt: v.optional(v.number()),
    resolvedValue: v.optional(v.number()),
  })
    .index("by_employee_date_field", ["employeeId", "reportDate", "field"])
    .index("by_status", ["status"])
    .index("by_company_status", ["companyId", "status"]),

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
    userHistory: v.optional(v.array(v.object({ user: v.string(), changedAt: v.number() }))),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("disabled")),
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
    // Summary of the newest sample, maintained by the ingest device patch so
    // dashboard reads (teamOverview) never have to touch `activitySamples`.
    lastSample: v.optional(
      v.object({
        capturedAt: v.number(),
        idleMs: v.number(),
        active: v.boolean(),
        tzOffsetMinutes: v.number(),
      }),
    ),
    // Running total for the device's current local day, maintained alongside
    // `dailyStats` by the same ingest patch so teamOverview (reactive, read by
    // every open dashboard tab) can read today's totals off the row it's
    // already reading instead of a separate per-device `dailyStats` query —
    // that extra query was one more document every connected viewer re-read
    // on every ingest tick.
    todayStats: v.optional(
      v.object({
        day: v.string(),
        activeSeconds: v.number(),
        idleSeconds: v.number(),
      }),
    ),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_status", ["status"])
    .index("by_personId", ["personId"])
    .index("by_tokenHash", ["tokenHash"]),

  // Coworkers being tracked (managed in the dashboard). `userId` links a person
  // to their intranet identity, resolved during migration via `clockodoUserId`
  // or `email`. The external-id fields map a person to the integrated systems.
  //
  // Relationship to `users`: a `users` row has zero or one linked `people`
  // row (via `people.userId`); a `people` row can be unlinked, meaning
  // "tracked by ActivityTrack, not yet an intranet account." These ids
  // (`employeeId`, `genesysUserId`, `clockodoUserId`) are ActivityTrack-only
  // identifiers and are never a substitute for `users.role`/`departmentId`/
  // `customRoleId` — don't derive org/permission decisions from `people`.
  //
  // `clockodoUserId` is stored here as a `string` and on `users` as a
  // `number` for the same real-world Clockodo id — a pre-existing mismatch.
  // `users.clockodoUserId` is canonical once a person is linked (see
  // `activity/people.ts`, which blocks editing this field directly after
  // linking); use `lib/clockodoId.ts`'s `toClockodoIdString` at any boundary
  // that compares the two rather than unifying the storage type here.
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
  // The per-device near-constant fields (`windowsUser`, `hostname`,
  // `agentVersion`, `platform`) are no longer stored per row — they live on
  // the `devices` row — and are optional only so rows written before the
  // change stay valid.
  activitySamples: defineTable({
    deviceId: v.string(),
    windowsUser: v.optional(v.string()),
    hostname: v.optional(v.string()),
    idleMs: v.number(),
    active: v.boolean(),
    capturedAt: v.number(),
    receivedAt: v.number(), // server clock, for skew detection
    tzOffsetMinutes: v.number(),
    agentVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
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
        v.literal("NOT_RESPONDING"),
      ),
    ),
    genesysPresence: v.optional(
      v.union(v.literal("AVAILABLE"), v.literal("BUSY"), v.literal("AWAY"), v.literal("OFFLINE")),
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
      v.literal("IDLE"),
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
      v.literal("IDLE"),
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
      v.literal("IDLE"),
    ),
    /** When the rejected transition would have taken effect (epoch ms). */
    at: v.number(),
    /** Machine-readable rejection reason (e.g. "outside_business_hours"). */
    reason: v.string(),
    /** Signal source that triggered the rejected transition; unset for rows
     * quarantined retroactively by the backfill repair. */
    source: v.optional(v.union(v.literal("agent"), v.literal("genesys"), v.literal("clockodo"))),
  })
    .index("by_employee_time", ["employeeId", "at"])
    .index("by_at", ["at"]),

  // Integration health, one row per external source.
  integrationHealth: defineTable({
    source: v.union(v.literal("genesys"), v.literal("clockodo")),
    status: v.union(v.literal("ok"), v.literal("unavailable"), v.literal("unconfigured")),
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
  }).index("by_device_day", ["deviceId", "day"]),

  // Generated-on-request weekly pattern reports (one per employee per ISO
  // week, regenerating overwrites the same week's row). Findings are stored
  // as data — a locale key plus named, tone-tagged values — rather than
  // pre-rendered text, so the report renders in either language and the UI
  // decides formatting/highlighting. See `activity/lib/patterns.ts` for the
  // detection rules that produce them.
  activityPatternReports: defineTable({
    employeeId: v.string(),
    weekStart: v.string(), // YYYY-MM-DD, Monday
    generatedAt: v.number(),
    generatedByUserId: v.id("users"),
    metrics: v.object({
      activeSeconds: v.number(),
      idleSeconds: v.number(),
      quickFlipCount: v.number(),
      longestIdleStreakSeconds: v.number(),
      previous: v.optional(
        v.object({
          activeSeconds: v.number(),
          idleSeconds: v.number(),
          quickFlipCount: v.number(),
        }),
      ),
    }),
    // One row per day of the week, for the charts below the narrative.
    daily: v.array(
      v.object({
        day: v.string(),
        activeSeconds: v.number(),
        idleSeconds: v.number(),
        quickFlips: v.number(),
      }),
    ),
    findings: v.array(
      v.object({
        id: v.string(),
        severity: v.union(v.literal("good"), v.literal("bad"), v.literal("neutral")),
        // Locale key for the sentence template, e.g. "pattern.quickFlips" —
        // resolved client-side so the report renders in the viewer's language.
        key: v.string(),
        values: v.array(
          v.object({
            // Matches a `{name}` placeholder in the template.
            name: v.string(),
            value: v.union(v.string(), v.number()),
            format: v.optional(
              v.union(v.literal("duration"), v.literal("percent"), v.literal("count")),
            ),
            tone: v.optional(
              v.union(
                v.literal("ok"),
                v.literal("warn"),
                v.literal("info"),
                v.literal("muted"),
                v.literal("fg"),
              ),
            ),
          }),
        ),
      }),
    ),
  }).index("by_employee_week", ["employeeId", "weekStart"]),

  // Append-only audit of privileged dashboard actions.
  activityAuditLog: defineTable({
    actorUserId: v.id("users"),
    action: v.union(
      v.literal("settings.config"),
      v.literal("settings.update"),
      v.literal("person.create"),
      v.literal("person.update"),
      v.literal("person.remove"),
      v.literal("event.resolve"),
      v.literal("device.approve"),
      v.literal("device.disable"),
      v.literal("device.remove"),
      v.literal("device.link"),
      v.literal("maintenance.quarantineOutOfHours"),
      v.literal("maintenance.pruneNow"),
    ),
    target: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  // Operational error/health events from every surface (deduplicated).
  activitySystemEvents: defineTable({
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("critical"),
    ),
    code: v.string(),
    source: v.union(v.literal("backend"), v.literal("tracker"), v.literal("dashboard")),
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
      v.literal("paused"),
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
      v.literal("paused"),
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
  }).index("by_migration", ["migrationId"]),

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

  // --- Guidebook highlights --------------------------------------------------
  // Manager-curated "featured" guides shown in their own section at the top of
  // the guidebooks list, for everyone. One row per currently-highlighted slug.
  guidebookHighlights: defineTable({
    slug: v.string(),
    highlightedByUserId: v.id("users"),
    highlightedAt: v.number(),
  }).index("by_slug", ["slug"]),

  // --- Guidebook attachments --------------------------------------------------
  // Admin-uploaded files (PDFs, docs, ...) attached to a guidebook page,
  // alongside its fixed article content — guidebooks are static components,
  // not a CMS, so this is the one piece of per-guidebook content that's
  // actually data-driven. Newly uploaded attachments are OneDrive-backed
  // rather than Convex storage: the bytes live under Team/Wiki/<slug>/
  // (apps/api's POST /onedrive/wiki/:slug/attach provisions that folder and
  // uploads there), so every active user's existing Team-zone read access
  // doubles as a backup copy with no extra permission grant. Convex only
  // ever stores the Graph item id + path reference; the actual file is
  // fetched on demand through apps/api's GET /onedrive/download/:id (never
  // a Graph preview link), so it stays reactive — a changed reference just
  // refetches. `storageId` and the OneDrive fields are both optional so
  // pre-existing rows from before this change (Convex-storage-backed, no
  // OneDrive reference yet) keep validating against this schema without a
  // migration — `guidebookAttachments.ts` branches on whichever is present.
  guidebookAttachments: defineTable({
    slug: v.string(),
    storageId: v.optional(v.id("_storage")),
    oneDriveItemId: v.optional(v.string()),
    oneDrivePath: v.optional(v.string()),
    name: v.string(),
    kind: v.union(v.literal("image"), v.literal("file")),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  // --- Guidebook pages (custom, manager-authored) ----------------------------
  // Unlike the hardcoded guidebooks in `registry.ts` (a React component per
  // guide), these are built entirely through the block-based editor
  // (`/guidebooks/new`) and rendered from stored data — the "write a wiki
  // page like a Word doc" flow. `blocks` is JSON-encoded (see
  // `apps/intranet/src/lib/guidebook-blocks.ts` for the shape) rather than a
  // modeled union, so new block types don't need a schema migration.
  // `imageStorageIds` denormalizes every image block's storage id purely for
  // cleanup on delete/edit — the JSON blob itself is opaque to Convex.
  guidebookPages: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    topic: v.string(),
    teams: v.array(v.string()),
    minRole: v.optional(v.union(v.literal("manager"), v.literal("admin"))),
    blocks: v.string(),
    imageStorageIds: v.array(v.id("_storage")),
    authorUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_slug", ["slug"]),

  // --- Guidebook read receipts -------------------------------------------------
  // One row per user per slug, written when the user explicitly confirms
  // "I read and understood this" (guidebookReads.markRead) — not a side
  // effect of merely opening the page. Drives the "read" checkmark on
  // guidebooks list cards, the "new in the wiki" dashboard section, and the
  // per-entry confirmer list editors see (unread/unconfirmed = no row here
  // yet). Never deleted.
  guidebookReads: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    readAt: v.number(),
  })
    .index("by_user_slug", ["userId", "slug"])
    .index("by_user", ["userId"])
    .index("by_slug", ["slug"]),

  // --- Wiki v2 (categories + entries) ------------------------------------------
  // The wiki overhaul: manageable colour-coded categories, entries with a
  // validity window (renewal reminders + an "expired" archive), version
  // numbers, tags and pinning — ported from a design prototype. Replaces
  // `guidebookPages` as the primary "write a wiki page" flow going forward;
  // existing `guidebookPages` rows are one-time migrated into `wikiEntries`
  // via `wikiMigration.run` (see that file) rather than read directly by the
  // list page once migration has happened. The hardcoded registry guidebooks
  // (`registry.ts`) are untouched — they're interactive tools/components,
  // not content, so there's nothing to migrate for those.
  wikiCategories: defineTable({
    name: v.string(),
    color: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }),

  wikiEntries: defineTable({
    slug: v.string(),
    categoryId: v.optional(v.id("wikiCategories")),
    // Snapshot of the category name/color, kept once the category is
    // deleted — the entry moves into the "expired" archive view instead of
    // pointing at nothing (mirrors errorReports.categoryName).
    categoryName: v.optional(v.string()),
    thema: v.string(),
    erklaerung: v.string(),
    tags: v.array(v.string()),
    link: v.optional(v.string()),
    validFrom: v.number(),
    validUntil: v.number(),
    version: v.number(),
    pinned: v.boolean(),
    authorUserId: v.id("users"),
    authorName: v.string(),
    ownerUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_category", ["categoryId"]),

  // The public marketing-site blog. Authored from apps/intranet (gated by
  // the manage_blog capability), read publicly (no auth) from apps/marketing
  // via a plain ConvexHttpClient — see blogPosts.ts's getAll/getBySlug.
  blogPosts: defineTable({
    slug: v.string(),
    language: v.union(v.literal("de"), v.literal("en")),
    // Same value on a post's de and en version, so they can be linked later.
    translationKey: v.optional(v.string()),
    title: v.string(),
    excerpt: v.string(),
    // Sanitized HTML from RichTextEditor, same storage shape as
    // wikiEntries.erklaerung — apps/marketing sanitizes again on render
    // since this is a raw mutation arg with no server-side sanitization in
    // front of it, and it renders on the public site.
    body: v.string(),
    mainImageStorageId: v.optional(v.id("_storage")),
    // Resolved from mainImageStorageId at publish time so an unauthenticated
    // marketing-site read never needs to call the auth-gated files.getUrl.
    mainImageUrl: v.optional(v.string()),
    authorUserId: v.id("users"),
    authorName: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    publishedAt: v.optional(v.number()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug_language", ["slug", "language"])
    .index("by_language_status_publishedAt", ["language", "status", "publishedAt"]),

  // Singleton marker — presence of a row means the one-time migration from
  // `guidebookPages` into `wikiEntries` has run. The wiki list page shows a
  // full-screen "migrate now" gate (manager-triggered) until this exists.
  wikiMigrationStatus: defineTable({
    migratedAt: v.number(),
    migratedByUserId: v.id("users"),
    migratedCount: v.number(),
  }),

  // --- Wallbox Sales Academy (interactive guidebook) -------------------------
  // Ported from a standalone training tool that gated access with a
  // participant access code and a shared admin PIN (not Clerk roles) — kept
  // as-is here rather than replaced with account-based auth, since every
  // visitor is already a signed-in intranet employee anyway and the
  // code/PIN gate is what the trainer workflow (create participant, email
  // the code, review results, answer questions) is built around.
  // `academyId` scopes rows to a specific training module (only
  // "wallbox-sales" exists today).
  //
  // `linkedUserId` is the one piece of real account integration: once a
  // participant finishes, an admin in the Trainer area can link their
  // results to an actual intranet account (e.g. for the person's record),
  // set via `academyParticipants.linkToAccount`.
  academyParticipants: defineTable({
    academyId: v.string(),
    name: v.string(),
    email: v.string(),
    code: v.string(),
    createdAt: v.number(),
    linkedUserId: v.optional(v.id("users")),
    linkedAt: v.optional(v.number()),
    linkedByUserId: v.optional(v.id("users")),
  })
    .index("by_academy_code", ["academyId", "code"])
    .index("by_academy", ["academyId"])
    .index("by_linkedUserId", ["linkedUserId"]),

  // One row per participant, JSON-encoded like `tourProgress.checkpointStatuses`
  // (chapters/research/calls/lastCh/started/finished).
  academyResults: defineTable({
    participantId: v.id("academyParticipants"),
    academyId: v.string(),
    data: v.string(),
    updatedAt: v.number(),
  })
    .index("by_participant", ["participantId"])
    .index("by_academy", ["academyId"]),

  // Free-text "ask the trainer" questions raised from a chapter, answered by
  // whoever is in the academy's Trainer area (PIN-gated, see above).
  academyQuestions: defineTable({
    participantId: v.id("academyParticipants"),
    academyId: v.string(),
    chapterId: v.string(),
    chapterTitle: v.string(),
    text: v.string(),
    answer: v.optional(v.string()),
    answered: v.boolean(),
    createdAt: v.number(),
    answeredAt: v.optional(v.number()),
  })
    .index("by_participant", ["participantId"])
    .index("by_academy", ["academyId"]),

  // One row per academy holding the shared admin PIN (default "1234" when
  // no row exists yet, mirroring the original tool). The PIN itself is only
  // ever compared server-side (`academySettings.checkPin`) — never returned
  // to the client — even though gaining "admin" is otherwise the same
  // client-side trust model as the original standalone tool.
  academySettings: defineTable({
    academyId: v.string(),
    pin: v.string(),
    updatedAt: v.number(),
  }).index("by_academyId", ["academyId"]),

  // --- Per-user app preferences ---------------------------------------------
  // One row per user; every field optional so features can add preferences
  // without migrations. Client-side cosmetics (e.g. "always preview") stay in
  // localStorage — this table is for preferences that must follow the user
  // across devices.
  userPreferences: defineTable({
    userId: v.id("users"),
    hiddenDashboardCards: v.optional(v.array(v.string())),
    dashboardCardOrder: v.optional(v.array(v.string())),
    dashboardDensity: v.optional(v.union(v.literal("comfortable"), v.literal("compact"))),
    defaultCalendarView: v.optional(
      v.union(v.literal("month"), v.literal("week"), v.literal("list")),
    ),
    /** App route to land on after sign-in (e.g. "/calendar"). */
    startPage: v.optional(v.string()),
    weekStartsOn: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
    /** AG-root-relative OneDrive folder paths pinned in the file browser. */
    favoriteFolders: v.optional(v.array(v.string())),
    favoriteGuidebooks: v.optional(v.array(v.string())),
    savedDirectoryViews: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          department: v.string(),
          role: v.string(),
          team: v.string(),
          myTeamsOnly: v.boolean(),
          availableNow: v.boolean(),
          grouped: v.boolean(),
          view: v.union(v.literal("list"), v.literal("grid")),
        }),
      ),
    ),
    savedTicketViews: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          statusFilter: v.union(
            v.literal("alle"),
            v.literal("attention"),
            v.literal("unassigned"),
            v.literal("offen"),
            v.literal("bearbeitung"),
            v.literal("closed"),
          ),
          showAll: v.boolean(),
        }),
      ),
    ),
    savedApplicantViews: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          status: v.union(v.literal("alle"), v.literal("neu"), v.literal("pool")),
          rating: v.union(
            v.literal("alle"),
            v.literal("gruen"),
            v.literal("blau"),
            v.literal("rot"),
            v.literal("offen"),
          ),
          health: v.union(
            v.literal("alle"),
            v.literal("uncontacted"),
            v.literal("overdue"),
            v.literal("stale"),
          ),
        }),
      ),
    ),
    lastGuidebookSlug: v.optional(v.string()),
    /** Release key of the last dismissed "What's new" dialog. */
    dismissedWhatsNew: v.optional(v.string()),
    browserPushEnabled: v.optional(v.boolean()),
    onboardingStartedAt: v.optional(v.number()),
    onboardingCompletedAt: v.optional(v.number()),
    /** Set when the user skips onboarding from the welcome step. Distinct from
     * `onboardingCompletedAt` for future analytics, but both hide the header
     * trigger and resume affordance the same way. */
    onboardingDismissedAt: v.optional(v.number()),
    /** Resume index into the onboarding wizard's step list. */
    onboardingStep: v.optional(v.number()),
    /** JSON-encoded Record<OnboardingStepId, "pending"|"completed"|"skipped">. */
    onboardingStepStatuses: v.optional(v.string()),
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
      v.literal("cancelled"),
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
    .index("by_driveItemId", ["driveItemId"])
    .index("by_createdAt", ["createdAt"]),

  // Append-only audit of OneDrive actions (requests, approvals, deletes, …).
  // `request`/`upload`/`approve`/`deny` are written directly from
  // `onedrive.ts`; `mkdir`/`move`/`rename`/`delete`/`restore`/`share` are
  // relayed from the Elysia API's Graph-backed file actions via
  // `apiRecordAction` (see apps/api/src/routes/onedrive.ts `recordAction`).
  onedriveAudit: defineTable({
    actorUserId: v.id("users"),
    action: v.union(
      v.literal("request"),
      v.literal("upload"),
      v.literal("approve"),
      v.literal("deny"),
      v.literal("mkdir"),
      v.literal("move"),
      v.literal("rename"),
      v.literal("delete"),
      v.literal("restore"),
      v.literal("share"),
      v.literal("grant_gf_access"),
      v.literal("revoke_gf_access"),
      v.literal("enable_uploads"),
      v.literal("disable_uploads"),
      v.literal("teamAccessGrant"),
      v.literal("teamAccessRevoke"),
    ),
    target: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  // Append-only audit of admin/integrations actions (Clockodo user
  // provisioning today; `integration` grows as more providers are added).
  integrationsAuditLog: defineTable({
    actorUserId: v.id("users"),
    integration: v.union(v.literal("clockodo")),
    action: v.union(
      v.literal("clockodo.link"),
      v.literal("clockodo.unlink"),
      v.literal("clockodo.updateUser"),
      v.literal("clockodo.setTargetHours"),
      v.literal("clockodo.setVacation"),
    ),
    target: v.optional(v.string()),
    // Human-readable summary of what changed (e.g. "role: worker -> owner")
    // — the employee detail page's History tab reads this directly rather
    // than reconstructing a diff from `action` + `target` alone.
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_integration_target", ["integration", "target"]),

  /**
   * Unified audit log (Group 10 of the backend QoL backlog) — a single
   * table for everything `activityAuditLog`, `onedriveAudit`,
   * `integrationsAuditLog`, and `applicantAuditLog` record, discriminated
   * by `domain`. Those four tables share near-identical shape and were
   * already merged manually at *read* time (see `auditLog.ts`'s `list`,
   * which only covers activity/onedrive/integrations today).
   *
   * Chosen approach: dual-write. Every existing write site now also writes
   * a row here (see `lib/auditLogWrite.ts`'s `recordUnifiedAudit`), but the
   * 4 original tables are left fully in place — nothing here deletes them,
   * stops writing to them, or migrates their historical rows. Reads
   * (`auditLog.ts`) still read the old tables; this table isn't wired into
   * any reader yet. This is intentionally the safer, additive half of the
   * migration — cutting reads over to this table (and eventually retiring
   * the 4 old ones + backfilling their history) is a follow-up, not done
   * here. `action` is a plain string (not a literal union) since it now
   * spans 4 different domains' action vocabularies — the per-domain tables
   * keep their own stricter literal unions as the source of truth.
   */
  auditLog: defineTable({
    domain: v.union(
      v.literal("activity"),
      v.literal("onedrive"),
      v.literal("integrations"),
      v.literal("applicant"),
    ),
    actorUserId: v.id("users"),
    action: v.string(),
    /** Only meaningful for `domain: "integrations"` (e.g. "clockodo"). */
    integration: v.optional(v.string()),
    target: v.optional(v.string()),
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_domain_at", ["domain", "at"]),

  /**
   * Temporary diagnostic aid: raw wire responses from third-party APIs,
   * captured so their actual (often under-documented) field shapes can be
   * inspected directly in the Convex dashboard's Data tab rather than
   * guessed at from docs. Not meant to be a permanent audit trail — safe to
   * clear out once a given integration's shape is nailed down.
   */
  integrationsRawDebugLog: defineTable({
    integration: v.union(v.literal("clockodo")),
    endpoint: v.string(),
    payload: v.string(),
    at: v.number(),
  }).index("by_at", ["at"]),

  /**
   * Every inbound Clockodo webhook delivery (both `/webhooks/clockodo` and
   * `/integrations/clockodo/webhook`), success or failure. Vercel/Convex's own
   * function logs don't retain far enough back to catch an intermittent 401
   * that only shows up once a day — this table is the durable record so a
   * failure can be inspected (event, token presence/length, reason) whenever
   * it's noticed, not just in the moment it happens. Pruned after 30 days.
   */
  clockodoWebhookLog: defineTable({
    endpoint: v.union(v.literal("webhooks/clockodo"), v.literal("integrations/clockodo/webhook")),
    eventName: v.optional(v.string()),
    ok: v.boolean(),
    reason: v.string(),
    tokenPresent: v.boolean(),
    tokenLength: v.optional(v.number()),
    resourceId: v.optional(v.string()),
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

  // --- Applicant Management (Bewerbermanagement) ---------------------------

  /** One skill profile per position (e.g. "Buchhalter"), for skill matching. */
  applicantSkillProfiles: defineTable({
    name: v.string(),
    skills: v.array(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }),

  applicants: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    telefon: v.optional(v.string()),
    adresse: v.optional(v.string()),
    geburtsdatum: v.optional(v.string()),
    position: v.optional(v.string()),
    skills: v.array(v.string()),
    ausbildung: v.optional(v.string()),
    berufserfahrung: v.optional(v.string()),
    zusammenfassung: v.optional(v.string()),
    rating: v.optional(ampelValidator),
    profilId: v.optional(v.id("applicantSkillProfiles")),
    notizen: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    convertedEmployeeProfileId: v.optional(v.id("employeeProfiles")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_profil", ["profilId"])
    .index("by_email", ["email"]),

  employeeProfiles: defineTable({
    userId: v.optional(v.id("users")),
    sourceApplicantId: v.optional(v.id("applicants")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    department: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    notes: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"])
    .index("by_sourceApplicant", ["sourceApplicantId"])
    .index("by_createdAt", ["createdAt"]),

  // Employee documents are OneDrive-backed (Team/HR/<employee>/…), same
  // reasoning as `guidebookAttachments`: Convex only stores the reference,
  // the vault-unlock gate (`requireApplicantAccess`) is what actually
  // protects them. `storageId` is kept optional purely for rows uploaded
  // before this change (Convex-storage-backed) — `humanResources.ts`
  // branches on whichever is present.
  employeeDocuments: defineTable({
    employeeProfileId: v.id("employeeProfiles"),
    storageId: v.optional(v.id("_storage")),
    oneDriveItemId: v.optional(v.string()),
    oneDrivePath: v.optional(v.string()),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    category: v.union(
      v.literal("documents"),
      v.literal("legal"),
      v.literal("payroll"),
      v.literal("contract"),
      v.literal("other"),
    ),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_employee", ["employeeProfileId"])
    .index("by_storageId", ["storageId"]),

  /** Uploaded CV PDFs, stored in Convex file storage. */
  applicantDocuments: defineTable({
    applicantId: v.id("applicants"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    createdAt: v.number(),
  })
    .index("by_applicant", ["applicantId"])
    .index("by_storageId", ["storageId"]),

  /**
   * Kontakte (contact log). An applicant with zero rows here is "Neue
   * Bewerber"; the first row moves them into the "Bewerberpool".
   */
  applicantContacts: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    art: kontaktArtValidator,
    notiz: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_applicant", ["applicantId"]),

  /** Tracked sent emails — does NOT count as first contact. */
  applicantEmails: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    kategorie: emailKategorieValidator,
    notiz: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_applicant", ["applicantId"]),

  applicantInterviews: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    interviewer: v.string(),
    notiz: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_applicant", ["applicantId"]),

  /**
   * Termine (appointments). `uebernommen` flips to true once "converted" into
   * an `applicantContacts` row (and an `applicantInterviews` row when
   * `typ === "interview"`).
   */
  applicantAppointments: defineTable({
    applicantId: v.id("applicants"),
    datum: v.string(),
    uhrzeit: v.string(),
    art: terminArtValidator,
    typ: terminTypValidator,
    notiz: v.optional(v.string()),
    uebernommen: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_applicant", ["applicantId"])
    .index("by_datum", ["datum"]),

  // Append-only audit of Applicant Management access grants/revocations.
  applicantAuditLog: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    target: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  /**
   * Applicant Management "vault": a secondary password gating the whole
   * feature on top of the normal applicantAccess/delegate checks —
   * defense-in-depth against a leaked or unattended session, not a
   * replacement for those checks. Each member sets their own password (no
   * shared secret); the row is deleted when their applicant access/delegate
   * status is revoked, or when an admin resets it, forcing a fresh setup
   * next visit.
   */
  applicantVaultPasswords: defineTable({
    userId: v.id("users"),
    hash: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Per-user vault unlock, expiring so the password must be re-entered
   * periodically rather than once ever. Rotating or resetting the password
   * (above) deletes the corresponding row here. */
  applicantVaultUnlocks: defineTable({
    userId: v.id("users"),
    unlockedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_user", ["userId"]),

  // --- Password resets for the non-Clerk password areas --------------------
  /**
   * One "I forgot my password" ping, filed from a lock screen after a failed
   * attempt. Filing one never changes a password and never issues anything —
   * it only puts the account in front of an admin, who decides whether to
   * mail out a reset link (`passwordResetTokens`) or dismiss it.
   *
   * A row is written even when `targetEmail` matches no account at all
   * (`targetUserId`/`targetLoginId` both absent). That keeps the caller's
   * response identical either way — a lock screen must not double as an
   * account-existence oracle — and turns repeated misses into a visible
   * probing signal instead of nothing. Unresolved rows deliberately send no
   * admin email/notification, so they can't be used to spam anyone.
   */
  passwordResetRequests: defineTable({
    scope: passwordResetScopeValidator,
    /** Lowercased email of the account the reset is *for*. */
    targetEmail: v.string(),
    targetUserId: v.optional(v.id("users")),
    targetLoginId: v.optional(v.id("performanceLogins")),
    targetCompanyId: v.optional(v.id("companies")),
    /** The signed-in intranet identity that filed it, when there was one —
     * absent for a Performance login filed from a tenant domain, where the
     * filer has no Clerk session at all. */
    requestedByUserId: v.optional(v.id("users")),
    requestedByEmail: v.optional(v.string()),
    /** False when the filer's own identity doesn't match the account they
     * asked about (or is unknown) — the "an employee is asking for their
     * manager's login" case an admin must eyeball before issuing anything. */
    selfService: v.boolean(),
    status: v.union(v.literal("pending"), v.literal("issued"), v.literal("dismissed")),
    createdAt: v.number(),
    handledByUserId: v.optional(v.id("users")),
    handledAt: v.optional(v.number()),
  })
    .index("by_status_createdAt", ["status", "createdAt"])
    // Backs the 24h-per-account cooldown.
    .index("by_scope_email", ["scope", "targetEmail"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * A single-use magic link an admin issued for one request. Only the SHA-256
   * of the token is stored — the plaintext exists solely in the emailed URL,
   * so a database read can't be turned back into a working link. Issuing a
   * new token revokes the target's outstanding ones, and consuming one
   * revokes the rest.
   */
  passwordResetTokens: defineTable({
    scope: passwordResetScopeValidator,
    tokenHash: v.string(),
    requestId: v.id("passwordResetRequests"),
    targetUserId: v.optional(v.id("users")),
    targetLoginId: v.optional(v.id("performanceLogins")),
    /** Where the link was mailed — always the account's own address, never
     * the filer's, so an approved-but-impersonated request still can't hand
     * the link to whoever filed it. */
    sentToEmail: v.string(),
    issuedByUserId: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_targetUser", ["targetUserId"])
    .index("by_targetLogin", ["targetLoginId"])
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Append-only trail for the whole reset flow — every filing, every
   * cooldown rejection, every admin decision (and the step-up
   * re-verification behind it), every link consumed. Separate from the
   * generic `auditLog` because this is the one place where "who asked for
   * whose account, and which admin acted on it" has to be reconstructable
   * long after the request row itself has been purged.
   *
   * Rows hold emails and ids but never a token, a token hash, or a password
   * — nothing here can be replayed into access.
   */
  passwordResetAuditLog: defineTable({
    event: v.union(
      v.literal("request_filed"),
      v.literal("request_cooldown_blocked"),
      v.literal("request_unknown_account"),
      v.literal("admins_notified"),
      v.literal("link_issued"),
      v.literal("request_dismissed"),
      v.literal("token_checked"),
      v.literal("reset_completed"),
      v.literal("reset_rejected"),
      v.literal("reverification_failed"),
    ),
    scope: passwordResetScopeValidator,
    requestId: v.optional(v.id("passwordResetRequests")),
    /** Who performed the action — the person filing, or the admin deciding. */
    actorUserId: v.optional(v.id("users")),
    actorEmail: v.optional(v.string()),
    /** Whether the actor was an admin acting on someone else's account. */
    actorIsAdmin: v.optional(v.boolean()),
    /** Whether the admin email-code step-up (`lib/adminVerification.ts`) was
     * satisfied for this action. */
    reverified: v.optional(v.boolean()),
    targetEmail: v.optional(v.string()),
    targetUserId: v.optional(v.id("users")),
    targetLoginId: v.optional(v.id("performanceLogins")),
    /** Short, non-sensitive free text (a reason code, a masked address, a
     * cooldown expiry) — never a token or password. */
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_request", ["requestId"])
    .index("by_actor", ["actorUserId"]),

  /**
   * The step-up gate for admin password-reset actions (`issueResetLink`,
   * `dismissRequest`): a 6-digit code mailed to the admin's own address via
   * Resend, proving whoever holds the Convex session also holds that inbox
   * right now. One row per admin — requesting a new code replaces any
   * existing one, so there is never more than one guessable code live at a
   * time. Once the correct code lands, `verifiedAt` is set and *is* the
   * "recently verified" proof `lib/adminVerification.ts`'s
   * `isRecentlyVerified` checks; the row is reused (not deleted) until it
   * expires or is replaced, so one code can clear several admin actions
   * within the verification window.
   */
  adminVerificationCodes: defineTable({
    adminUserId: v.id("users"),
    /** sha256 of the 6-digit code — the plaintext is never stored. */
    codeHash: v.string(),
    attempts: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()),
  }).index("by_admin", ["adminUserId"]),

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

  // --- Sales Coach EV (live call-coaching for Projekt Elektromobilitaet) ------
  // Transcript and feedback text may contain real customer conversations, so
  // both are stored as AES-256-GCM ciphertext (encrypted in the Elysia API
  // with a server-held key, same pattern as wikiChats above) — this layer
  // never sees or stores plaintext call content. `scores`/`skillLevel` stay
  // plain so charts and the admin roster can read them without decrypting.
  salesCoachEvCalls: defineTable({
    clerkUserId: v.string(),
    userName: v.string(), // snapshot at write time, for admin roster display
    startedAt: v.number(),
    durationSec: v.number(),
    callerSpeakPct: v.number(),
    outcome: v.union(v.literal("termin"), v.literal("wiedervorlage"), v.literal("kein_ergebnis")),
    transcriptEnc: v.string(), // ciphertext
    scored: v.boolean(),
    skillLevel: v.optional(v.number()),
    // Keys match the AI system prompt's JSON schema verbatim (see
    // apps/api/src/routes/sales-coach-ev.ts) so no key-renaming layer is
    // needed between the model's output and storage.
    scores: v.optional(
      v.object({
        zufriedenheit: v.number(),
        ev_schwenk: v.number(),
        informationen: v.number(),
        offene_fragen: v.number(),
        sprache: v.number(),
        quittung: v.number(),
        abschluss: v.number(),
        skript: v.number(),
      }),
    ),
    feedbackEnc: v.optional(v.string()), // ciphertext (encrypted JSON)
  })
    .index("by_user_time", ["clerkUserId", "startedAt"])
    .index("by_startedAt", ["startedAt"]),

  // Org-wide shared knowledge base for Sales Coach EV — small table, admin-authored.
  salesCoachEvWiki: defineTable({
    title: v.string(),
    cat: v.union(
      v.literal("Produktdaten"),
      v.literal("Preisliste"),
      v.literal("Technik"),
      v.literal("Argumente"),
      v.literal("Rechtliches"),
      v.literal("Intern"),
      v.literal("Links"),
    ),
    tags: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    isLink: v.optional(v.boolean()),
    authorClerkUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // Per-user KPI/call-guide text, fed into the AI coaching prompts.
  salesCoachEvSettings: defineTable({
    clerkUserId: v.string(),
    kpiText: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["clerkUserId"]),

  // --- Fehlermanagement (QVM error/quality management, Sales) -----------------
  // A standalone quality-error tracking tool ported from a prototype built
  // around the 8D/PDCA methodology — entirely separate from the
  // guidebooks/wiki system (its own tab, its own data). Errors are logged,
  // escalated (derived from severity/due date — see
  // `apps/intranet/src/lib/error-management.ts`, not stored) and closed once
  // a linked corrective measure's effectiveness has been checked.
  errorCategories: defineTable({
    name: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }),

  errorReports: defineTable({
    categoryId: v.optional(v.id("errorCategories")),
    // Snapshot of the category name, kept if the category is later deleted
    // (mirrors how deleted guidebook-topic labels are preserved elsewhere).
    categoryName: v.optional(v.string()),
    description: v.string(),
    severity: v.union(
      v.literal("niedrig"),
      v.literal("mittel"),
      v.literal("hoch"),
      v.literal("kritisch"),
    ),
    status: v.union(v.literal("neu"), v.literal("in_bearbeitung"), v.literal("geschlossen")),
    customerOrProject: v.optional(v.string()),
    responsibleName: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    customerInformedAt: v.optional(v.number()),
    customerRespondedAt: v.optional(v.number()),
    prevention: v.optional(v.string()),
    customerFeedback: v.optional(
      v.union(v.literal("positiv"), v.literal("neutral"), v.literal("negativ")),
    ),
    effectivenessChecked: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    closedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_category", ["categoryId"])
    .index("by_createdAt", ["createdAt"])
    // "Closed in window" for the resolution timeline — an error opened before
    // the window but closed inside it has to land in the closed series.
    .index("by_closedAt", ["closedAt"]),

  // 8D-PDCA corrective measures linked to an error report. `phase` walks
  // through the standard 8D steps: immediate containment (D3) → root cause
  // (D4) → corrective action (D5/D6) → effectiveness check (D7) →
  // prevention (D8).
  errorMeasures: defineTable({
    errorReportId: v.id("errorReports"),
    description: v.string(),
    phase: v.union(
      v.literal("d3_sofort"),
      v.literal("d4_ursache"),
      v.literal("d5_d6_abstellung"),
      v.literal("d7_wirksamkeit"),
      v.literal("d8_vorbeugung"),
    ),
    status: v.union(v.literal("offen"), v.literal("erledigt")),
    responsibleName: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    relatedLinks: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("guidebook"),
            v.literal("announcement"),
            v.literal("ticket"),
            v.literal("other"),
          ),
          label: v.string(),
          url: v.string(),
        }),
      ),
    ),
    dueAt: v.optional(v.number()),
    effectivenessChecked: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_error", ["errorReportId"])
    .index("by_status", ["status"]),

  errorMeasureDocuments: defineTable({
    measureId: v.id("errorMeasures"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_measure", ["measureId"])
    .index("by_storageId", ["storageId"]),

  // Singleton row (Stammdaten thresholds) — created lazily with defaults on
  // first read if it doesn't exist yet.
  errorSettings: defineTable({
    targetResponseDays: v.number(),
    warnResponseDays: v.number(),
    defaultDueDays: v.number(),
    defaultMeasureDueDays: v.number(),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  }),

  // --- Sales Cockpit (Telefonieren / Projekte / Lexikon) -------------------
  // Ported from a standalone prototype (window.storage-backed) into real
  // Convex-persisted data. A "Projekt" is a calling campaign: an opening
  // line, general benefits/goals, Salesforce input notes and attached
  // documents. Conversation routes used to live inline as "Wege" (the
  // `salesCockpitWege` table below) but that's superseded by linking a
  // `salesCockpitFlows` tree instead — `flowId` is that link. Existing
  // Wege rows are kept and still hydrated/read for projects that have
  // them (read-only history), but the project form no longer creates or
  // edits them; new projects link a Flow instead.
  salesCockpitProjects: defineTable({
    titel: v.string(),
    start: v.optional(v.string()), // ISO date (YYYY-MM-DD)
    einstiegssatz: v.optional(v.string()),
    benefits: v.array(v.string()),
    ziele: v.array(v.string()),
    sfInput: v.optional(v.string()),
    flowId: v.optional(v.id("salesCockpitFlows")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_createdAt", ["createdAt"]),

  // One row per conversation route ("Weg") within a project — legacy,
  // read-only history now that Wege editing has been replaced by linking a
  // Flow (see `salesCockpitProjects.flowId` above). `einwaende` is a small,
  // bounded list of {einwand, antwort} pairs authored inline in the old
  // project form, so keeping it as a nested array here (rather than yet
  // another table) is simplest — it never needs its own index or partial
  // update.
  salesCockpitWege: defineTable({
    projectId: v.id("salesCockpitProjects"),
    name: v.string(),
    einwaende: v.array(v.object({ einwand: v.string(), antwort: v.string() })),
    benefit: v.optional(v.string()),
    ziele: v.optional(v.string()),
    order: v.number(),
  }).index("by_project", ["projectId"]),

  // Files attached to a project, grouped by category (Projektplan / Script /
  // sonstige Datei) — mirrors the prototype's `files.plan/scripte/dateien`
  // buckets but as rows referencing real Convex storage instead of
  // base64/localStorage blobs.
  salesCockpitFiles: defineTable({
    projectId: v.id("salesCockpitProjects"),
    category: v.union(v.literal("plan"), v.literal("scripte"), v.literal("dateien")),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    uploadedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_storageId", ["storageId"]),

  // Knowledge-base ("Lexikon") entries: an uploaded document with a title
  // and tags, searchable by keyword. `content` holds the extracted text for
  // text-ish files (txt/csv/md/html/json/log/xml) so search can match inside
  // the file body, not just the title/tags — mirrors the prototype's
  // client-side full-text search, now server-side. The entry count is small
  // (a company knowledge base, not a document store), so `search` just
  // `.collect()`s and does a case-insensitive substring match in JS rather
  // than a Convex search index — simpler, and matches the prototype's exact
  // substring/highlight behaviour instead of token-based search relevance.
  salesCockpitLexikon: defineTable({
    titel: v.string(),
    tags: v.array(v.string()),
    fileName: v.string(),
    storageId: v.id("_storage"),
    size: v.number(),
    isText: v.boolean(),
    /** Extracted text content for text files; undefined for binary files. */
    content: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_storageId", ["storageId"]),

  // Call-flow trees, edited in the React Flow-powered composer
  // (`/sales-cockpit/flows/[flowId]`). Deliberately its own top-level entity
  // rather than nested under `salesCockpitWege`: `updateProject`'s
  // `replaceWege` deletes and reinserts every Weg row on every save, so a
  // Weg's `_id` isn't stable across an edit — anything keyed off it (like a
  // node tree) would get silently orphaned the next time someone tweaks the
  // project's title. A Flow can optionally reference a project for context,
  // but never a Weg.
  salesCockpitFlows: defineTable({
    titel: v.string(),
    projectId: v.optional(v.id("salesCockpitProjects")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_project", ["projectId"]),

  // One row per node in a flow's tree. `parentId` is undefined only for a
  // flow's single root node; every other node hangs off exactly one parent,
  // and `branchLabel` is the customer answer/objection that walks the
  // conversation down that particular branch — this is the n8n-style
  // "answer branches" tree, not a general DAG (no node has two parents).
  salesCockpitFlowNodes: defineTable({
    flowId: v.id("salesCockpitFlows"),
    parentId: v.optional(v.id("salesCockpitFlowNodes")),
    branchLabel: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    x: v.number(),
    y: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_flow", ["flowId"])
    .index("by_parent", ["parentId"]),
});
