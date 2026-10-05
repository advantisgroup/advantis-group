import { defineTable } from "convex/server";
import { v } from "convex/values";

export const integrationsTables = {
  // Integration health, one row per external source. `genesys`/`clockodo`
  // rows come from ActivityTrack's poller.
  integrationHealth: defineTable({
    source: v.union(
      v.literal("genesys"),
      v.literal("clockodo"),
      // Webhooks apps/api receives; see integrations/health.ts.
      v.literal("clerk"),
      v.literal("resend"),
      v.literal("onedrive"),
    ),
    status: v.union(v.literal("ok"), v.literal("unavailable"), v.literal("unconfigured")),
    message: v.optional(v.string()),
    lastOkAt: v.optional(v.number()),
    lastErrorAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_source", ["source"]),

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
      // Deleting, restoring and purging authored content (lib/trash.ts).
      v.literal("content"),
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

  /** Offsite backups (the convex-backup GitHub Action) and the restore drills
   *  that prove them — what the admin backup card reads. */
  backupRuns: defineTable({
    kind: v.union(v.literal("backup"), v.literal("restore_test")),
    status: v.union(v.literal("ok"), v.literal("failed")),
    fileName: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    note: v.optional(v.string()),
    recordedByUserId: v.optional(v.id("users")),
    at: v.number(),
  }).index("by_kind_at", ["kind", "at"]),
};
