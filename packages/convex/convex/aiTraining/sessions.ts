import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { serverUserMutation, serverUserQuery, userMutation, userQuery } from "../functions";
import { displayName } from "../lib/users";
import { log, requireTrainer } from "./lib";

const fileValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  mediaType: v.string(),
  size: v.number(),
});

export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    requireTrainer(ctx.caller);
    const rows = await ctx.db
      .query("aiTrainingSessions")
      .withIndex("by_updated")
      .order("desc")
      .take(100);
    return Promise.all(
      rows.map(async (s) => ({
        _id: s._id,
        title: s.title,
        createdByName: displayName(await ctx.db.get(s.createdBy)),
        gapId: s.gapId ?? null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    );
  },
});

async function messagesOf(ctx: QueryCtx, sessionId: Id<"aiTrainingSessions">) {
  const rows = await ctx.db
    .query("aiTrainingMessages")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(400);
  return Promise.all(
    rows.map(async (m) => ({
      _id: m._id,
      role: m.role,
      authorName: m.authorId ? displayName(await ctx.db.get(m.authorId)) : null,
      content: m.content,
      runId: m.runId ?? null,
      createdAt: m.createdAt,
      files: await Promise.all(
        (m.files ?? []).map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.storageId) })),
      ),
    })),
  );
}

export const get = userQuery({
  args: { sessionId: v.id("aiTrainingSessions") },
  handler: async (ctx, { sessionId }) => {
    requireTrainer(ctx.caller);
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const gap = session.gapId ? await ctx.db.get(session.gapId) : null;
    return {
      _id: session._id,
      title: session.title,
      createdByName: displayName(await ctx.db.get(session.createdBy)),
      gap: gap
        ? { _id: gap._id, question: gap.question, detail: gap.detail ?? null, status: gap.status }
        : null,
      messages: await messagesOf(ctx, sessionId),
    };
  },
});

export const create = userMutation({
  args: { title: v.optional(v.string()), gapId: v.optional(v.id("aiTrainingGaps")) },
  handler: async (ctx, { title, gapId }) => {
    requireTrainer(ctx.caller);
    const gap = gapId ? await ctx.db.get(gapId) : null;
    const name = (title?.trim() || gap?.question || "Neues Training").slice(0, 120);
    const now = Date.now();
    const id = await ctx.db.insert("aiTrainingSessions", {
      title: name,
      createdBy: ctx.caller.id,
      gapId: gap?._id,
      createdAt: now,
      updatedAt: now,
    });
    await log(ctx, ctx.caller.id, "session_started", name, { href: `/ki-pflege/training?s=${id}` });
    return id;
  },
});

export const rename = userMutation({
  args: { sessionId: v.id("aiTrainingSessions"), title: v.string() },
  handler: async (ctx, { sessionId, title }) => {
    requireTrainer(ctx.caller);
    const name = title.trim().slice(0, 120);
    if (!name) return null;
    await ctx.db.patch(sessionId, { title: name });
    return null;
  },
});

/** Training files go straight to storage; the API reads them back by id. */
export const generateUploadUrl = userMutation({
  args: {},
  handler: async (ctx) => {
    requireTrainer(ctx.caller);
    return await ctx.storage.generateUploadUrl();
  },
});

// --- apps/api ----------------------------------------------------------------

export const apiContext = serverUserQuery({
  args: { sessionId: v.id("aiTrainingSessions") },
  handler: async (ctx, { sessionId }) => {
    requireTrainer(ctx.caller);
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const gap = session.gapId ? await ctx.db.get(session.gapId) : null;
    return {
      title: session.title,
      gap: gap ? { question: gap.question, detail: gap.detail ?? null } : null,
      messages: await messagesOf(ctx, sessionId),
    };
  },
});

/** Type and size as storage recorded them — what the browser claimed doesn't count. */
export const apiFileInfo = serverUserQuery({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    requireTrainer(ctx.caller);
    return Promise.all(
      storageIds.slice(0, 10).map(async (id) => {
        const meta = await ctx.db.system.get(id);
        return meta
          ? { storageId: id, contentType: meta.contentType ?? null, size: meta.size }
          : null;
      }),
    );
  },
});

export const apiAddMessage = serverUserMutation({
  args: {
    sessionId: v.id("aiTrainingSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    files: v.optional(v.array(fileValidator)),
    runId: v.optional(v.id("aiRuns")),
  },
  handler: async (ctx, { sessionId, role, content, files, runId }) => {
    requireTrainer(ctx.caller);
    const session = await ctx.db.get(sessionId);
    if (!session) throw new ConvexError({ code: "not_found", message: "Not found" });
    const now = Date.now();
    await ctx.db.insert("aiTrainingMessages", {
      sessionId,
      role,
      authorId: role === "user" ? ctx.caller.id : undefined,
      content: content.slice(0, 60_000),
      files: files && files.length > 0 ? files : undefined,
      runId,
      createdAt: now,
    });
    await ctx.db.patch(sessionId, { updatedAt: now });
    if (role === "user") {
      const names = (files ?? []).map((f) => f.name).join(", ");
      await log(ctx, ctx.caller.id, "message_sent", session.title, {
        detail: [content.slice(0, 300), names && `Dateien: ${names}`].filter(Boolean).join(" · "),
        href: `/ki-pflege/training?s=${sessionId}`,
      });
    }
    return null;
  },
});

export const apiAddProposal = serverUserMutation({
  args: {
    sessionId: v.id("aiTrainingSessions"),
    kind: v.union(
      v.literal("wiki_new"),
      v.literal("wiki_update"),
      v.literal("rule_new"),
      v.literal("rule_update"),
    ),
    entryId: v.optional(v.string()),
    ruleId: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    categoryName: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    requireTrainer(ctx.caller);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError({ code: "not_found", message: "Not found" });
    let entryId: Id<"wikiEntries"> | undefined;
    let ruleId: Id<"aiTrainingRules"> | undefined;
    let baseVersion: number | undefined;
    if (args.kind === "wiki_update") {
      const id = args.entryId ? ctx.db.normalizeId("wikiEntries", args.entryId) : null;
      const entry = id ? await ctx.db.get(id) : null;
      if (!entry) return { ok: false as const, error: "Unbekannter Wiki-Eintrag." };
      entryId = entry._id;
      baseVersion = entry.version;
    }
    // "builtin" (or no id) means the briefing that still lives in code: applying
    // it creates its row.
    if (args.kind === "rule_update" && args.ruleId && args.ruleId !== "builtin") {
      const id = ctx.db.normalizeId("aiTrainingRules", args.ruleId);
      if (!id || !(await ctx.db.get(id))) return { ok: false as const, error: "Unbekannte Regel." };
      ruleId = id;
    }
    const proposalId = await ctx.db.insert("aiTrainingProposals", {
      sessionId: args.sessionId,
      gapId: session.gapId,
      kind: args.kind,
      entryId,
      ruleId,
      title: args.title.trim().slice(0, 200) || "Ohne Titel",
      body: args.body.slice(0, 100_000),
      tags: args.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
      categoryName: args.categoryName?.trim().slice(0, 80) || undefined,
      baseVersion,
      reason: args.reason.trim().slice(0, 2000),
      status: "open",
      createdBy: ctx.caller.id,
      createdAt: Date.now(),
    });
    return { ok: true as const, proposalId };
  },
});
