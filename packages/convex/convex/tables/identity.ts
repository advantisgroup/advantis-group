import { defineTable } from "convex/server";
import { v } from "convex/values";

import { reportsViaValidator } from "../lib/reporting";
import { capabilityValidator, roleValidator } from "../lib/validators";

export const identityTables = {
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
    /** No longer read; see lib/reporting.ts. */
    reportsVia: v.optional(reportsViaValidator),
    /** Managing director (Geschäftsführer): a distinction on top of their role
     *  and reporting lines, not a line of its own. Admins set it. */
    managingDirector: v.optional(v.boolean()),
    /**
     * `removed` replaces deleting the row: everything that points at a user
     * (authors, audit rows, chat members…) keeps resolving to a real name.
     */
    status: v.union(v.literal("active"), v.literal("suspended"), v.literal("removed")),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
    /** `updated_at` of the newest Clerk event applied, to skip older ones. */
    clerkUpdatedAt: v.optional(v.number()),
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
    /** Topics colleagues can ask this person about ("who knows …"). */
    expertise: v.optional(v.array(v.string())),
    /** Last time an admin confirmed this person still needs their access. */
    accessReviewedAt: v.optional(v.number()),
    accessReviewedByUserId: v.optional(v.id("users")),
    /**
     * Opaque code identifying this person as the source of a share link
     * (`/share/blog/x?r=<code>`). Deliberately not the Clerk id or anything
     * else guessable — a share link gets pasted into group chats and public
     * posts, so what travels in it should mean nothing to anyone but us.
     * Minted on first use, not at signup.
     */
    referralCode: v.optional(v.string()),
    /**
     * Whether new share links this person creates carry their `referralCode`.
     * Set from the toggle in the share sheet, remembered so the choice is
     * made once rather than every time. Undefined = on, matching the toggle's
     * default for a signed-in colleague sharing company content.
     */
    referralSharingEnabled: v.optional(v.boolean()),
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
    .index("by_referralCode", ["referralCode"])
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

  totpCredentials: defineTable({
    userId: v.id("users"),
    /** AES-256-GCM ciphertext of the base32 secret — only the API service holds the key, Convex never decrypts it. */
    secretCiphertext: v.string(),
    /** Set once the user proves possession during enrollment; an unverified row is a pending setup that hasn't been confirmed yet. */
    verifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    /** The 30-second TOTP step of the last accepted code. A code stays
     * cryptographically valid across the whole drift window, so without this
     * the same six digits pass again for up to ~90 seconds. */
    lastUsedStep: v.optional(v.number()),
    /** Set when a recovery code was spent, which only happens because the
     * authenticator is gone. The row stops counting as a qualifying factor
     * until the user sets a new authenticator up. */
    recoveryUsedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  totpRecoveryCodes: defineTable({
    userId: v.id("users"),
    codeHash: v.string(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  totpAuditLog: defineTable({
    userId: v.id("users"),
    event: v.union(
      v.literal("enrolled"),
      v.literal("verified"),
      v.literal("failed"),
      v.literal("recovery_used"),
      v.literal("recovery_regenerated"),
      v.literal("removed"),
    ),
    at: v.number(),
  }).index("by_user_at", ["userId", "at"]),

  /**
   * Canonical org departments. Replaces the free-text `users.department` —
   * see the org-data migration (`orgDataMigration.ts`) that backfills
   * `users.departmentId` from the legacy string values.
   */
  departments: defineTable({
    name: v.string(),
    /** Reserved for a future org-chart phase; unused by today's logic. */
    parentId: v.optional(v.id("departments")),
    /** The department lead — everyone in the department reports to them. */
    reportsToUserId: v.optional(v.id("users")),
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
    /** The team lead — everyone on the team reports to them. */
    reportsToUserId: v.optional(v.id("users")),
    /** Teams split a department into smaller groups (Inbound under Sales). */
    departmentId: v.optional(v.id("departments")),
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
    /** Dead — design preview ended. Drop after `migrations/dropDesignPreviewFields` runs. */
    designPreview: v.optional(v.union(v.literal("refreshed"), v.literal("classic"))),
    /** Dead — design preview ended. Drop after `migrations/dropDesignPreviewFields` runs. */
    designFeedbackPromptedAt: v.optional(v.number()),
    /** Custom sidebar layout — sections of nav hrefs. Empty means the default. */
    sidebarSections: v.optional(
      v.array(
        v.object({ id: v.string(), title: v.optional(v.string()), items: v.array(v.string()) }),
      ),
    ),
    collapsedSidebarSections: v.optional(v.array(v.string())),
    /** Per-card dashboard size, keyed by card id. Replaces `dashboardDensity`. */
    dashboardCardSizes: v.optional(
      v.record(v.string(), v.union(v.literal("compact"), v.literal("normal"), v.literal("wide"))),
    ),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
};
