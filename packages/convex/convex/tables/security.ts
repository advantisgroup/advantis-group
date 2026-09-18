import { defineTable } from "convex/server";
import { v } from "convex/values";

import { passwordResetScopeValidator } from "../lib/validators";

export const securityTables = {
  // --- Centralized step-up / reverification --------------------------------
  // One engine behind every "prove it's really you" moment: signing in under
  // an org/personal MFA requirement, an admin reverifying before a sensitive
  // action, a destructive action that wants a fresher check. See lib/stepUp.ts.

  /** Org-wide policy. Singleton — at most one row; an absent row means every
   * requirement is off. */
  authPolicy: defineTable({
    requireMfaScope: v.union(v.literal("off"), v.literal("all"), v.literal("managers_and_up")),
    requireMfaRetroactive: v.boolean(),
    /** Bumped only when the requireMfa* fields above change — not on every
     * save — so "does this account predate the policy" stays accurate even
     * if an unrelated field (like the destructive-action TTL) is edited. */
    mfaPolicySetAt: v.number(),
    requireMfaForDestructive: v.boolean(),
    destructiveActionTtlMinutes: v.number(),
    minDestructiveLevel: v.number(),
    requirePasskeyScope: v.union(v.literal("off"), v.literal("all"), v.literal("managers_and_up")),
    requirePasskeyRetroactive: v.boolean(),
    passkeyPolicySetAt: v.number(),
    gracePeriodDays: v.number(),
    exemptUserIds: v.array(v.id("users")),
    // Optional so older rows read as the defaults in lib/stepUp.ts.
    areaReverifyDays: v.optional(v.number()),
    /** Turning a sunset on starts its grace clock (`SetAt`); once it runs
     * out, the area's own password stops working for accounts that have
     * another way in — a linked Performance login, a vault member with a
     * passkey. */
    performanceLegacyPasswordSunsetEnabled: v.optional(v.boolean()),
    performanceLegacyPasswordSunsetSetAt: v.optional(v.number()),
    applicantVaultLegacyPasswordSunsetEnabled: v.optional(v.boolean()),
    applicantVaultLegacyPasswordSunsetSetAt: v.optional(v.number()),
    legacyPasswordGraceDays: v.optional(v.number()),
    updatedAt: v.number(),
    updatedByUserId: v.id("users"),
  }),

  /** Per-user sign-in preference — same upsert shape as notificationPreferences. */
  securityPreferences: defineTable({
    userId: v.id("users"),
    alwaysRequireMfaAtSignIn: v.boolean(),
    /** No devices are stored, and every sign-in counts as untrusted. */
    deviceTrackingOptOut: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** An issued email code, scoped per (user, Clerk session) — replaces
   * adminVerificationCodes, which was scoped per-admin only. */
  stepUpChallenges: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
    codeHash: v.string(),
    attempts: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()),
  }).index("by_user_session", ["userId", "sessionId"]),

  /** The "cleared" ledger — one row per method satisfied this (user, session).
   * A session can accumulate more than one, e.g. email code now, TOTP later
   * if a destructive action demands a higher level. */
  stepUpVerifications: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
    method: v.union(
      v.literal("email_code"),
      v.literal("totp"),
      v.literal("recovery_code"),
      v.literal("passkey"),
    ),
    level: v.number(),
    context: v.union(
      v.literal("sign_in"),
      v.literal("destructive"),
      v.literal("admin_reverify"),
      v.literal("area_reverify"),
    ),
    verifiedAt: v.number(),
  }).index("by_user_session", ["userId", "sessionId"]),

  /** Single-use proof that `finishAuthentication` (apps/api passkeys.ts)
   * really did complete a WebAuthn check, handed to the client alongside the
   * Clerk sign-in ticket and redeemed once the new Clerk session exists —
   * stops a signed-in client from just claiming "I used a passkey". */
  stepUpPasskeyTickets: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_user", ["userId"]),

  /** One browser this account signs in from, keyed by its Clerk client — the
   * browser-level record Clerk keeps across sign-ins, IP changes and browser
   * updates. `deviceHash` (coarse IP prefix + user-agent, never the raw IP)
   * is the older key; rows without a `clerkClientId` get adopted by the first
   * client seen with a matching hash. Purged periodically (see crons.ts).
   *
   * `trustedUntil` is only earned by passing a step-up in a session on this
   * device (see `recordVerified`); visiting again never extends it. */
  knownDevices: defineTable({
    userId: v.id("users"),
    clerkClientId: v.optional(v.string()),
    deviceHash: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    name: v.optional(v.string()),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    trustedUntil: v.optional(v.number()),
  })
    .index("by_user_hash", ["userId", "deviceHash"])
    .index("by_user_client", ["userId", "clerkClientId"])
    .index("by_lastSeenAt", ["lastSeenAt"]),

  /** One-shot result of the device check for a given session, written by
   * apps/api (the one place that sees real request headers) and read by
   * `resolveSignInRequirement`. `newDevice` really means "untrusted device":
   * never seen, trust expired, or the account opted out of recognition.
   * `deviceId` is which device this session is on, so a step-up passed here
   * can trust that device; absent when the account opted out. */
  sessionRiskSignals: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
    newDevice: v.boolean(),
    deviceId: v.optional(v.id("knownDevices")),
    evaluatedAt: v.number(),
  }).index("by_user_session", ["userId", "sessionId"]),

  stepUpAuditLog: defineTable({
    userId: v.id("users"),
    event: v.union(
      v.literal("challenge_issued"),
      v.literal("verified"), // detail carries the method (email_code|totp|recovery_code|passkey)
      v.literal("failed"), // detail carries method + reason
      v.literal("enrollment_prompted"),
      v.literal("policy_changed"),
      v.literal("new_device_detected"),
      v.literal("device_trust_revoked"),
    ),
    context: v.optional(
      v.union(
        v.literal("sign_in"),
        v.literal("destructive"),
        v.literal("admin_reverify"),
        v.literal("area_reverify"),
      ),
    ),
    detail: v.optional(v.string()),
    at: v.number(),
  }).index("by_user_at", ["userId", "at"]),

  /** Last step-up for a linked area. Per (user, area) rather than per
   * session, so it survives a new Clerk session. */
  areaStepUps: defineTable({
    userId: v.id("users"),
    area: v.union(v.literal("performance"), v.literal("applicant_vault")),
    verifiedAt: v.number(),
    method: v.union(
      v.literal("email_code"),
      v.literal("totp"),
      v.literal("recovery_code"),
      v.literal("passkey"),
    ),
  }).index("by_user_area", ["userId", "area"]),

  /** Absent row means `trust_device`. */
  areaSecurityPreferences: defineTable({
    userId: v.id("users"),
    area: v.union(v.literal("performance"), v.literal("applicant_vault")),
    mode: v.union(v.literal("always_step_up"), v.literal("trust_device")),
    updatedAt: v.number(),
  }).index("by_user_area", ["userId", "area"]),

  /** Extra addresses an account has proven it owns. No `verifiedAt` means
   * the code was never confirmed, and the row counts for nothing. */
  userSecondaryEmails: defineTable({
    userId: v.id("users"),
    email: v.string(),
    verifiedAt: v.optional(v.number()),
    addedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_email", ["userId", "email"])
    // A verified row here must be globally unique — see `secondaryEmails.ts`'s
    // conflict checks — so a lookup by email alone (not scoped to a user)
    // has to be possible.
    .index("by_email", ["email"]),

  /** One open verification code per (user, candidate email) — same shape as
   * `stepUpChallenges`, just proving ownership of a new address instead of
   * re-proving the account's existing one. */
  userSecondaryEmailChallenges: defineTable({
    userId: v.id("users"),
    email: v.string(),
    codeHash: v.string(),
    attempts: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_user_email", ["userId", "email"]),

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
     * manager's login" case an admin must eyeball before issuing anything.
     * Untouched by `autoApproved` below — it keeps meaning exactly this,
     * even for a row that skipped human review. */
    selfService: v.boolean(),
    /** True when the mismatch above was explained away automatically — the
     * filer (or the typed email itself) resolved to this account through an
     * admin-established link, not through eyeballing. See
     * `autoApprovedVia` for which kind of link. Absent on every row written
     * before this existed, which reads identically to `false`. */
    autoApproved: v.optional(v.boolean()),
    /** `callerLinkedAccount`: the filer is signed in as the intranet account
     * this login's `linkedUserId` already points at. `targetLinkedAccount`:
     * the *typed* email didn't match the login directly, but matched its
     * linked intranet account's email instead. `adminLinkedEmail`: neither
     * of those applied, but an admin explicitly registered this pair in
     * `passwordResetLinkedEmails`. `verifiedSecondaryEmail`: the typed email
     * matched a *verified* `userSecondaryEmails` row the account holder
     * added themselves. */
    autoApprovedVia: v.optional(
      v.union(
        v.literal("callerLinkedAccount"),
        v.literal("targetLinkedAccount"),
        v.literal("adminLinkedEmail"),
        v.literal("verifiedSecondaryEmail"),
      ),
    ),
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
    /** Absent for a link `autoIssueLinkedReset` minted on its own — there's
     * no admin actor to record. */
    issuedByUserId: v.optional(v.id("users")),
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
      /** Same as `link_issued`, minted by `autoIssueLinkedReset` with no
       * admin actor — kept distinct so the trail (and the admin queue) can
       * tell "a human decided this" from "a known link decided this". */
      v.literal("link_auto_issued"),
      /** `autoIssueLinkedReset` ran but `prepareAutoIssue` no longer found
       * the same reasoning `requestReset` did (the link was edited or
       * removed in the scheduler gap, or the account stopped resolving) —
       * the request is left `pending` for a human instead of silently
       * failing open. `detail` names which check failed. */
      v.literal("auto_issue_skipped"),
      /** An admin killed a still-live, unused link before it was opened. */
      v.literal("link_revoked"),
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
   * Admin-declared "these two emails are the same person" pairs — the
   * fallback for a mismatch `resolveTarget` can't already explain via
   * `performanceLogins.linkedUserId`. A hit here makes `requestReset` treat
   * `aliasEmail` as if `canonicalEmail` had been typed instead, and skip the
   * manual approval step the way a linked-account match would.
   *
   * Deliberately separate from `linkedUserId`: that link is for signing
   * into Performance via an intranet session and is 1:1 by account id. This
   * is a plain "these addresses both reach the same person" note, admin
   * text-entered, with no bearing on authentication.
   */
  passwordResetLinkedEmails: defineTable({
    scope: passwordResetScopeValidator,
    /** Performance email uniqueness is per-company; absent for `hr`. */
    companySlug: v.optional(v.string()),
    /** Lowercased — the address that might get typed or signed in with by
     * mistake. */
    aliasEmail: v.string(),
    /** Lowercased — the address `resolveTarget` already knows how to
     * resolve to a real account. */
    canonicalEmail: v.string(),
    addedByUserId: v.id("users"),
    createdAt: v.number(),
    note: v.optional(v.string()),
  }).index("by_scope_company_alias", ["scope", "companySlug", "aliasEmail"]),
};
