import { defineTable } from "convex/server";
import { v } from "convex/values";

import { aiRunKind, aiRunPhase, aiRunStatus } from "../lib/aiRuns";
import { draftSurface } from "../drafts/lib/surfaces";

export const aiTables = {
  // --- Wiki Chat (AI assistant history) ------------------------------------
  // Per-user chat history for the Wiki AI assistant. Title and message blobs
  // are stored as AES-256-GCM ciphertext (encrypted in the Elysia API with a
  // server-held key); the database never contains plaintext chat content.
  wikiChats: defineTable({
    clerkUserId: v.string(),
    title: v.string(), // ciphertext
    messages: v.string(), // ciphertext (encrypted JSON of the message array)
    // Kept at the top of the chat list.
    pinnedAt: v.optional(v.number()),
    // Files attached to its questions — ciphertext too, sealed by the API
    // before upload. Listed here so deleting the chat deletes them.
    files: v.optional(v.array(v.id("_storage"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["clerkUserId"]),

  // --- AI runs ---------------------------------------------------------------
  // Every AI call in the intranet, tracked so the answer survives a closed
  // dialog or a refresh (see aiRuns.ts). `output` is ciphertext from apps/api,
  // same as wikiChats; the browser only ever reads the metadata from here.
  aiRuns: defineTable({
    clerkUserId: v.string(),
    kind: aiRunKind,
    // What the run is about, e.g. "wikiChat:<chatId>" — one live run per key.
    subjectKey: v.string(),
    // Where the dock sends someone to see the result.
    href: v.optional(v.string()),
    status: aiRunStatus,
    phase: aiRunPhase,
    output: v.optional(v.string()), // ciphertext, partial while running
    outputChars: v.number(),
    // What the run is doing along the way (searching, reading), so the chat
    // can show it live. Ciphertext like `output`; `stepsRev` counts changes so
    // the browser knows when to fetch it again.
    steps: v.optional(v.string()),
    stepsRev: v.optional(v.number()),
    // A few words saying what the run was about (the question asked, the file
    // read), so a history row means something. Ciphertext like `output`.
    title: v.optional(v.string()),
    // Size of what was sent to the model — the transcript itself lives in
    // aiRunTranscripts so the dock's subscriptions never carry it around.
    transcriptChars: v.optional(v.number()),
    // What answered, how much it read and wrote, and what it was given —
    // so a run can be inspected after the fact instead of taken on trust.
    // Optional: runs from before this shipped carry none of it.
    model: v.optional(v.string()),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    sources: v.optional(v.array(v.object({ label: v.string(), href: v.optional(v.string()) }))),
    errorCode: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    startedAt: v.number(),
    heartbeatAt: v.number(),
    finishedAt: v.optional(v.number()),
    seenAt: v.optional(v.number()),
    // Put away from the dock with its ✕. Seeing a result doesn't do that —
    // a finished run stays there to be opened again for the rest of the day.
    dismissedAt: v.optional(v.number()),
  })
    .index("by_user", ["clerkUserId", "startedAt"])
    .index("by_user_subject", ["clerkUserId", "subjectKey", "startedAt"])
    .index("by_user_kind", ["clerkUserId", "kind", "startedAt"])
    .index("by_started", ["startedAt"]),

  // Workspace-wide AI settings, one row. Missing means the defaults in
  // aiRuns.ts.
  aiSettings: defineTable({
    // Runs an employee may start in any 24 hours. Managers and admins aren't
    // capped — they're the ones watching the usage on /admin/ai.
    dailyRunLimit: v.number(),
    // Whether the chat may search the public web at all. Off until a manager
    // turns it on — each person still chooses per chat on top of this.
    webSearch: v.optional(v.boolean()),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  }),

  // Exactly what a run sent to the model — instructions, messages and any
  // lookups, every turn — so an answer can be checked against what it was
  // actually given. One row per run, sealed by apps/api like `aiRuns.output`,
  // capped in size, and deleted with its run.
  aiRunTranscripts: defineTable({
    runId: v.id("aiRuns"),
    clerkUserId: v.string(),
    data: v.string(), // ciphertext of the transcript JSON
    chars: v.number(),
    truncated: v.boolean(),
    createdAt: v.number(),
  }).index("by_run", ["runId"]),

  // "Was this any good?" — one row per person per run. An error rate only
  // says what broke; this is the half that says what came back wrong while
  // looking fine, which is the failure mode nothing else catches.
  aiFeedback: defineTable({
    runId: v.id("aiRuns"),
    userId: v.id("users"),
    kind: aiRunKind,
    rating: v.union(v.literal("up"), v.literal("down")),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run_user", ["runId", "userId"])
    .index("by_created", ["createdAt"]),

  // --- KI-Pflege (aiTraining/*) ---------------------------------------------
  // Where chosen colleagues teach the assistant: open questions it couldn't
  // answer, a shared training chat (with uploads) that turns what they say
  // into reviewed changes to the wiki or to the assistant's own rules, and a
  // log of all of it. Everyone with `users.aiTrainer` (and every admin) sees
  // everything here — that is the point of it. Plain text on purpose: what
  // lands here is company knowledge headed for the wiki, not private chat.

  /** Something the assistant couldn't answer well. Never names who asked. */
  aiTrainingGaps: defineTable({
    question: v.string(),
    detail: v.optional(v.string()),
    source: v.union(
      v.literal("assistant"),
      v.literal("feedback"),
      v.literal("manual"),
      v.literal("check"),
    ),
    status: v.union(v.literal("open"), v.literal("answered"), v.literal("dismissed")),
    /** How often the same question came up while open. */
    count: v.number(),
    /** Only for gaps a trainer added; an employee's question stays unnamed. */
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
  }).index("by_status", ["status", "updatedAt"]),

  aiTrainingSessions: defineTable({
    title: v.string(),
    createdBy: v.id("users"),
    /** Started from a gap: applying its proposals answers the gap. */
    gapId: v.optional(v.id("aiTrainingGaps")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updated", ["updatedAt"]),

  aiTrainingMessages: defineTable({
    sessionId: v.id("aiTrainingSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    authorId: v.optional(v.id("users")),
    content: v.string(),
    files: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          name: v.string(),
          mediaType: v.string(),
          size: v.number(),
        }),
      ),
    ),
    runId: v.optional(v.id("aiRuns")),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "createdAt"]),

  /** A change the assistant suggests. Nothing reaches the wiki or the
   *  assistant's rules until a trainer applies it. */
  aiTrainingProposals: defineTable({
    sessionId: v.optional(v.id("aiTrainingSessions")),
    gapId: v.optional(v.id("aiTrainingGaps")),
    kind: v.union(
      v.literal("wiki_new"),
      v.literal("wiki_update"),
      v.literal("rule_new"),
      v.literal("rule_update"),
    ),
    entryId: v.optional(v.id("wikiEntries")),
    ruleId: v.optional(v.id("aiTrainingRules")),
    title: v.string(),
    /** HTML for the wiki, plain text for a rule. */
    body: v.string(),
    tags: v.array(v.string()),
    categoryName: v.optional(v.string()),
    /** The entry's version when proposed — applying over a newer one warns. */
    baseVersion: v.optional(v.number()),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("applied"), v.literal("rejected")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_session", ["sessionId", "createdAt"]),

  /** Standing instructions and background the assistant always gets, for
   *  what isn't a wiki article (tone, where to send people, internal
   *  numbers). `builtin` marks the briefing that used to live in the code. */
  aiTrainingRules: defineTable({
    title: v.string(),
    text: v.string(),
    active: v.boolean(),
    builtin: v.optional(v.boolean()),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  aiTrainingLog: defineTable({
    actorId: v.id("users"),
    action: v.union(
      v.literal("gap_added"),
      v.literal("gap_dismissed"),
      v.literal("gap_reopened"),
      v.literal("gap_answered"),
      v.literal("session_started"),
      v.literal("message_sent"),
      v.literal("proposal_applied"),
      v.literal("proposal_rejected"),
      v.literal("rule_saved"),
      v.literal("rule_deleted"),
      v.literal("check_run"),
      v.literal("trainer_granted"),
      v.literal("trainer_revoked"),
    ),
    target: v.string(),
    detail: v.optional(v.string()),
    href: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  // --- Drafts ----------------------------------------------------------------
  // Unsent composer/dialog state per person, so a refresh or a closed sheet
  // never costs anyone their text (see drafts.ts).
  drafts: defineTable({
    userId: v.id("users"),
    surface: draftSurface,
    subjectKey: v.string(), // the draft's own id (fresh draft), or the id of the thing being edited
    data: v.string(), // JSON the form restores from
    href: v.optional(v.string()), // where the draft was last written, so it can be reopened
    /** Set aside with "start a new draft": the subjectKey it was taken from. */
    parkedFrom: v.optional(v.string()),
    /** The version what's in the form builds on — its next version's parent. */
    headVersionId: v.optional(v.id("draftVersions")),
    updatedAt: v.number(),
  })
    .index("by_user_subject", ["userId", "surface", "subjectKey"])
    .index("by_user", ["userId", "updatedAt"])
    .index("by_updated", ["updatedAt"]),

  /** Snapshots of a draft over time, so earlier wording can be brought back.
   *  They form a tree: going back to an old version and writing on starts a
   *  new branch, and the one left behind stays. */
  draftVersions: defineTable({
    draftId: v.id("drafts"),
    userId: v.id("users"),
    data: v.string(),
    savedAt: v.number(),
    /** Null for the first version; missing on ones saved before branches
     *  existed, which read as a straight line. */
    parentId: v.optional(v.union(v.id("draftVersions"), v.null())),
    /** Given by the person — named versions are never thinned out. */
    name: v.optional(v.string()),
    /** Set once shared; cleared when nobody has it and it has no comments. */
    sharedAt: v.optional(v.number()),
  }).index("by_draft", ["draftId", "savedAt"]),

  /** One colleague's read access to one draft version. */
  draftShares: defineTable({
    versionId: v.id("draftVersions"),
    ownerId: v.id("users"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_version_user", ["versionId", "userId"])
    .index("by_user", ["userId", "createdAt"]),

  /** Feedback on a shared version, seen by its author and everyone it's shared with. */
  draftComments: defineTable({
    versionId: v.id("draftVersions"),
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_version", ["versionId", "createdAt"]),
};
