import { defineTable } from "convex/server";
import { v } from "convex/values";

export const salesTables = {
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
    // Optional attached source document (spec sheet, price list, ...) an
    // article was generated/enriched from — Convex-storage-backed, read
    // through the same `files.getUrl`/global file viewer as chat and
    // guidebook attachments.
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileContentType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    authorClerkUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  }).index("by_deletedAt", ["deletedAt"]),

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
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_status", ["status"])
    .index("by_category", ["categoryId"])
    .index("by_createdAt", ["createdAt"])
    // "Closed in window" for the resolution timeline — an error opened before
    // the window but closed inside it has to land in the closed series.
    .index("by_closedAt", ["closedAt"])
    .index("by_deletedAt", ["deletedAt"]),

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
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_error", ["errorReportId"])
    .index("by_status", ["status"])
    .index("by_deletedAt", ["deletedAt"]),

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
};
