// ActivityTrack was removed on 2026-10-05. These tables stay only until their
// production data is deleted; then remove this file and its schema entry.
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const activityTables = {
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
};
