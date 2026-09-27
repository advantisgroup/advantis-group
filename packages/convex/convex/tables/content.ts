import { defineTable } from "convex/server";
import { v } from "convex/values";

export const contentTables = {
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
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_slug", ["slug"])
    .index("by_deletedAt", ["deletedAt"]),

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
    /** The entry's `policyVersion` confirmed; absent = version 1. */
    version: v.optional(v.number()),
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
    // A policy: everyone confirms they've read it, and confirms again when
    // `policyVersion` goes up (an editor asks for that when a change
    // matters, not on every typo fix).
    policy: v.optional(v.boolean()),
    policyVersion: v.optional(v.number()),
    // Unset = everyone signed in. For how-tos about screens only managers
    // (or admins) have — enforced by every wiki read (see wiki/entries.ts).
    minRole: v.optional(v.union(v.literal("manager"), v.literal("admin"))),
    validFrom: v.number(),
    validUntil: v.number(),
    version: v.number(),
    pinned: v.boolean(),
    authorUserId: v.id("users"),
    authorName: v.string(),
    ownerUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_slug", ["slug"])
    .index("by_category", ["categoryId"])
    .index("by_author", ["authorUserId"])
    .index("by_deletedAt", ["deletedAt"]),

  // Org-wide default instructions for the "format with AI" wiki-entry
  // assist (apps/api's /wiki/format-assist) — singleton-by-key, same shape
  // as activitySettings. Only ever one row (key "default") for now.
  wikiFormatSettings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

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
    // Free-text rather than a union so adding a category is a code change in
    // the two apps' category tables, not a Convex schema push. The composer
    // only ever writes slugs from that fixed list, so typos can't creep in.
    category: v.optional(v.string()),
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
    // Both snapshotted at publish time, for the same reason as mainImageUrl —
    // the public marketing read is unauthenticated and can't resolve a
    // storage id or join the users table itself.
    authorAvatarUrl: v.optional(v.string()),
    /** Estimated read time in minutes, derived from the body on publish. */
    readingMinutes: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("published")),
    publishedAt: v.optional(v.number()),
    /**
     * Short base62 code behind `/share/blog/{code}`. Titles here run long
     * enough that the slug alone makes an unwieldy link to paste anywhere —
     * this is the shareable form. Minted at publish (and backfilled for
     * posts published before it existed); never regenerated, because links
     * already out in the world have to keep resolving.
     */
    shareCode: v.optional(v.string()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_slug_language", ["slug", "language"])
    .index("by_shareCode", ["shareCode"])
    .index("by_language_status_publishedAt", ["language", "status", "publishedAt"])
    .index("by_deletedAt", ["deletedAt"]),

  /**
   * First-party pageview log for the marketing site — replaces PostHog.
   * `sessionId` is a random id the client mints into `sessionStorage` (never
   * `localStorage`, never a cookie), so it dies with the tab and never
   * identifies a return visitor. No IP, no persistent id: nothing here needs
   * cookie consent.
   *
   * `postId` is set (from the page component's own props, not string
   * matching) only when the path is a blog post — a direct reference instead
   * of re-deriving `/${language}/blog/${slug}` and hoping it's exact, which
   * is what broke the old PostHog-backed panel.
   */
  analyticsPageviews: defineTable({
    path: v.string(),
    postId: v.optional(v.id("blogPosts")),
    locale: v.string(),
    sessionId: v.string(),
    /** Hostname only (e.g. "google.com"), never the full referrer URL. */
    referrerDomain: v.optional(v.string()),
    /**
     * The colleague whose share link brought this visit in, resolved from the
     * `?r=` code. Unlike everything else in this table this *is* tied to a
     * named person — which is exactly why it only ever gets set when that
     * person opted in while creating the link.
     */
    referrerUserId: v.optional(v.id("users")),
    /** Filled in later by a sendBeacon on pagehide; absent if that never fires. */
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_postId_createdAt", ["postId", "createdAt"])
    .index("by_sessionId_createdAt", ["sessionId", "createdAt"]),

  /** Named conversion events (whitepaper requested, contact form submitted,
   * ...) — the marketing-site equivalent of a PostHog custom event, minus
   * the property bag: none of the current events need one. */
  analyticsEvents: defineTable({
    name: v.string(),
    sessionId: v.string(),
    locale: v.string(),
    createdAt: v.number(),
  }).index("by_name_createdAt", ["name", "createdAt"]),

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
    /** Set only when `linkedUserId` was resolved by matching `email` against
     * `users.by_email` rather than picked by an admin (`linkedByUserId` set
     * instead). */
    autoLinkedVia: v.optional(v.literal("email_match")),
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

  // --- Academy course content ------------------------------------------------
  // Chapters, quiz questions and segment names used to be a 1300-line
  // `data.ts` in the frontend bundle, so fixing a typo in an answer meant a
  // deploy. `academy/content.ts`'s one-time `migrate` copies that file in here
  // once; from then on this is the source of truth and the file is only a
  // seed. Ordering is an explicit `order` rather than array position, and
  // nothing is hard-deleted (`archived`) — a question someone already answered
  // has to stay resolvable for their stored result to still mean anything.
  academySegments: defineTable({
    academyId: v.string(),
    key: v.string(),
    label: v.string(),
    order: v.number(),
  })
    .index("by_academy", ["academyId"])
    .index("by_academy_key", ["academyId", "key"]),

  academyChapters: defineTable({
    academyId: v.string(),
    /** Stable across edits and reorders — results key on this, never on the
     *  chapter's position. */
    chapterId: v.string(),
    title: v.string(),
    segment: v.string(),
    order: v.number(),
    /** `ChapterBlock[]`, JSON-encoded like `guidebookPages.blocks`. */
    body: v.string(),
    /** `[term, definition][]`, JSON-encoded. */
    glossary: v.optional(v.string()),
    /** Chapter renders the research tasks / call simulator instead of a body. */
    research: v.optional(v.boolean()),
    sim: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_academy", ["academyId"])
    .index("by_academy_chapter", ["academyId", "chapterId"]),

  // One row per question rather than a blob on the chapter, because questions
  // are edited, reordered and retired one at a time — and because per-question
  // analytics ("which question does everyone get wrong") needs them addressable.
  academyQuizQuestions: defineTable({
    academyId: v.string(),
    chapterId: v.string(),
    /** Stable id a stored answer refers to. Minted once by the migration as
     *  `<chapterId>-q<n>` from the original array position, which is what makes
     *  rewriting existing results deterministic. */
    questionId: v.string(),
    question: v.string(),
    options: v.array(v.string()),
    correctIndex: v.number(),
    order: v.number(),
    archived: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_academy", ["academyId"])
    .index("by_academy_chapter", ["academyId", "chapterId"])
    .index("by_academy_question", ["academyId", "questionId"]),

  /** Presence of a row means the content migration has run for this academy;
   *  the admin area's "migrate" button disappears once it exists. */
  academyContentStatus: defineTable({
    academyId: v.string(),
    migratedAt: v.number(),
    migratedByUserId: v.id("users"),
    chapterCount: v.number(),
    questionCount: v.number(),
    /** How many stored participant results had their answer keys rewritten
     *  from array indices to question ids. */
    rewrittenResults: v.number(),
  }).index("by_academy", ["academyId"]),
};
