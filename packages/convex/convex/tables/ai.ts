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
  })
    .index("by_user", ["clerkUserId", "startedAt"])
    .index("by_user_subject", ["clerkUserId", "subjectKey", "startedAt"])
    .index("by_user_kind", ["clerkUserId", "kind", "startedAt"])
    .index("by_started", ["startedAt"]),

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
