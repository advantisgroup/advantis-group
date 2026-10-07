import { defineTable } from "convex/server";
import { v } from "convex/values";

export const performanceTables = {
  // --- Performance (KPI dashboards) ---------------------------------------
  // One `companies` row = one dashboard (the table keeps its historical
  // name; the UI calls it "Dashboard"). Since 10/2026 access runs entirely
  // through the intranet (Clerk): a dashboard is linked to intranet teams
  // and/or departments (`teamIds`/`departmentIds`). Intranet admins see
  // every dashboard, the lead of a linked team/department sees the team
  // view, everyone else only their own employee page (via
  // `performanceEmployees.userId`). See `performance/lib/access.ts`.
  //
  // The domain/provisioning fields below are leftovers of the old
  // multi-tenant setup (own password logins per customer domain). They are
  // optional now and no longer read; kept so existing rows still validate.
  companies: defineTable({
    name: v.string(),
    // Internal identifier only (session/self-setup scoping) — auto-derived
    // from `domain` at creation time, never itself used for routing.
    slug: v.string(),
    /** Intranet teams whose members belong to this dashboard. */
    teamIds: v.optional(v.array(v.id("teams"))),
    /** Intranet departments whose members belong to this dashboard. */
    departmentIds: v.optional(v.array(v.id("departments"))),
    /** What the dashboard shows: `sales` (Salesforce leads/opps + calls, the
     * default), `wallbox` (the Wallbox campaign reports + calls) or `calls`
     * (Genesys calls only, e.g. Onboarding). Calls come from the shared call
     * report into every dashboard; see `uploadParse.ts`. */
    kind: v.optional(v.union(v.literal("sales"), v.literal("wallbox"), v.literal("calls"))),
    // Legacy (old tenant domain routing) — no longer read.
    domain: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("provisioning"), // row just created, about to call Vercel
        v.literal("pending_dns"), // added to Vercel, waiting on the owner's ownership-verification DNS record
        v.literal("pending_routing"), // ownership verified, but no A/CNAME actually routes traffic to Vercel yet
        v.literal("active"), // ownership verified AND traffic correctly routed — actually live
        v.literal("failed"), // a real error (not just "not verified yet")
      ),
    ),
    // Legacy: emails that could self-claim the old password Admin login.
    adminBootstrapEmails: v.optional(v.array(v.string())),
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

  // LEGACY (until 10/2026): `companyRoles`, `performanceLogins` and
  // `performanceSessions` belonged to the old separate password login. No
  // code reads them any more; they stay defined only so existing rows keep
  // validating until they are deleted.
  //
  // Named bundles of permission keys (old `performance/lib/permissions.ts`),
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
    // the old `backfillPerformanceCompanyId` migration had re-derived every
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
    /** Set only when `linkedUserId` was resolved by matching this login's
     * email against `users.by_email` rather than picked by an admin —
     * absent (with `linkedUserId` set) means a human chose the link. */
    autoLinkedVia: v.optional(v.literal("email_match")),
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
    /** Minted from an intranet session, not a password — keeps depending on
     * area trust for as long as it's used. */
    viaClerk: v.optional(v.boolean()),
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
    /** The intranet account behind this report name — what lets that person
     * see their own numbers. Set by an admin under Performance →
     * Einstellungen ("Automatisch zuordnen" also takes over the old
     * Performance-login links). */
    userId: v.optional(v.id("users")),
  })
    .index("by_company", ["companyId"])
    .index("by_userId", ["userId"])
    .index("by_company_name", ["companyId", "name"]),

  // Backfilled nightly (see crons.ts's `cacheCompletedMonthBadges`) with one
  // row per completed month, from the 3rd day after month end (late uploads
  // of the last day usually land on the 1st). `performance/queries.ts`
  // recomputes a cached month when a report for it was imported after
  // `computedAt`, so the cache only saves work, it never freezes old numbers.
  performanceBadgeCache: defineTable({
    companyId: v.optional(v.id("companies")),
    ym: v.string(),
    badges: v.record(v.string(), v.object({ value: v.number(), winners: v.array(v.string()) })),
    computedAt: v.number(),
    /** Badge rules the row was computed with; older rows are recomputed. */
    rulesVersion: v.optional(v.number()),
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
  // An import replaces exactly the date range its file covers (first to
  // last day), see `uploadParse.ts`'s `writeInteractions`.
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
        v.literal("wallbox_members"),
        v.literal("wallbox_opps"),
      ),
    ),
    // The report's own date (YYYY-MM-DD), as detected from its content —
    // not the upload time. Undefined for the aggregated template, which
    // spans multiple days itself.
    reportDate: v.optional(v.string()),
    // First day of a report that spans several days (an Interaktionen
    // export, a call report over several days); `reportDate` is then its
    // last day. Absent for single-day reports.
    reportDateFrom: v.optional(v.string()),
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
    // The upload page's "Tagesstatus": which report kinds exist per day.
    .index("by_company_reportDate", ["companyId", "reportDate"])
    // Duplicate-upload detection must be per-company — two different client
    // companies could upload files with identical bytes/hash by coincidence
    // (e.g. the blank template).
    .index("by_company_contentHash", ["companyId", "contentHash"]),

  // Wallbox campaign (dashboard kind `wallbox`): one row per uploaded report
  // day and source, aggregated at import time — the reports are full
  // point-in-time snapshots, so keeping each day's counts gives the
  // "Entwicklung" history for free. Re-uploading the same day replaces it.
  // People are kept as an array (not a record keyed by name: Convex field
  // names must be ASCII, and names have umlauts).
  performanceWallboxSnapshots: defineTable({
    companyId: v.id("companies"),
    reportDate: v.string(),
    source: v.union(v.literal("members"), v.literal("opps")),
    campaign: v.optional(v.string()),
    total: v.number(),
    /** members: campaign member statuses (base status, "min. 1 EV" split out). */
    statuses: v.optional(
      v.array(v.object({ status: v.string(), count: v.number(), ev: v.number() })),
    ),
    /** members: "In Progress - <Vorname>" per employee. opps: per Acquired
     * By (`role: "acquirer"`) and per Opportunity Owner (`role: "owner"`). */
    people: v.array(
      v.object({
        name: v.string(),
        role: v.union(v.literal("member"), v.literal("acquirer"), v.literal("owner")),
        employeeId: v.optional(v.id("performanceEmployees")),
        inProgress: v.optional(v.number()),
        inProgressEv: v.optional(v.number()),
        opps: v.optional(v.number()),
        open: v.optional(v.number()),
        won: v.optional(v.number()),
        lost: v.optional(v.number()),
      }),
    ),
    sourceFile: v.string(),
    uploadedAt: v.number(),
  }).index("by_company_source_date", ["companyId", "source", "reportDate"]),

  // The newest Wallbox opportunity report row by row, for the lists behind
  // the tables (which accounts, who owns them). Replaced only by a report
  // at least as new, like `performanceRawOpps`.
  performanceWallboxOpps: defineTable({
    companyId: v.id("companies"),
    reportDate: v.string(),
    account: v.string(),
    owner: v.string(),
    acquiredBy: v.string(),
    acquiredByEmployeeId: v.optional(v.id("performanceEmployees")),
    closed: v.boolean(),
    won: v.boolean(),
  }).index("by_company", ["companyId"]),

  // One row per dashboard, owned by the upload pipeline (`performance/
  // import.ts`). The raw dates say which report the drill-down tables
  // currently hold, so re-importing an older Lead/Opp file never replaces
  // newer lists. The lock keeps two imports for the same dashboard (two
  // admins, two browser tabs) from running their clear-then-insert steps
  // interleaved; it expires on its own in case an action dies mid-import.
  performanceImportState: defineTable({
    companyId: v.id("companies"),
    lockToken: v.optional(v.string()),
    lockedUntil: v.optional(v.number()),
    lockedBy: v.optional(v.string()),
    rawLeadsReportDate: v.optional(v.string()),
    rawOppsReportDate: v.optional(v.string()),
    wallboxOppsReportDate: v.optional(v.string()),
  }).index("by_company", ["companyId"]),

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
};
