import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const fileInputValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  size: v.number(),
});

const projectFilesInputValidator = v.object({
  plan: v.array(fileInputValidator),
  scripte: v.array(fileInputValidator),
  dateien: v.array(fileInputValidator),
});

const projectFieldsValidator = {
  titel: v.string(),
  start: v.optional(v.string()),
  einstiegssatz: v.optional(v.string()),
  benefits: v.array(v.string()),
  ziele: v.array(v.string()),
  sfInput: v.optional(v.string()),
  flowId: v.optional(v.id("salesCockpitFlows")),
  files: projectFilesInputValidator,
};

type FileCategory = "plan" | "scripte" | "dateien";

/** Replaces every `salesCockpitFiles` row for `projectId`, deleting storage
 *  objects for files that were removed and inserting rows for newly-uploaded
 *  ones (rows whose storageId is already attached are left as-is). */
async function replaceFiles(
  ctx: MutationCtx,
  projectId: Id<"salesCockpitProjects">,
  userId: Id<"users">,
  files: Record<FileCategory, { storageId: Id<"_storage">; name: string; size: number }[]>,
): Promise<void> {
  const existing = await ctx.db
    .query("salesCockpitFiles")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const keptStorageIds = new Set(
    (["plan", "scripte", "dateien"] as const).flatMap((cat) => files[cat].map((f) => f.storageId)),
  );
  await Promise.all(
    existing.map(async (row) => {
      if (keptStorageIds.has(row.storageId)) return;
      await ctx.db.delete(row._id);
      await ctx.storage.delete(row.storageId);
    }),
  );
  const existingStorageIds = new Set(existing.map((row) => row.storageId));
  const now = Date.now();
  await Promise.all(
    (["plan", "scripte", "dateien"] as const).flatMap((cat) =>
      files[cat]
        .filter((f) => !existingStorageIds.has(f.storageId))
        .map((f) =>
          ctx.db.insert("salesCockpitFiles", {
            projectId,
            category: cat,
            storageId: f.storageId,
            name: f.name,
            size: f.size,
            uploadedByUserId: userId,
            createdAt: now,
          }),
        ),
    ),
  );
}

async function hydrateProject(ctx: QueryCtx | MutationCtx, project: Doc<"salesCockpitProjects">) {
  const flowId = project.flowId;
  const [wege, files, flowDoc, flowNodes] = await Promise.all([
    // Legacy, read-only: rows from before Wege editing was replaced by
    // linking a Flow. Still hydrated so old projects keep showing them.
    ctx.db
      .query("salesCockpitWege")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect(),
    ctx.db
      .query("salesCockpitFiles")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect(),
    flowId ? ctx.db.get(flowId) : Promise.resolve(null),
    flowId
      ? ctx.db
          .query("salesCockpitFlowNodes")
          .withIndex("by_flow", (q) => q.eq("flowId", flowId))
          .collect()
      : Promise.resolve(null),
  ]);
  const flow = flowDoc ? { _id: flowDoc._id, titel: flowDoc.titel, nodeCount: flowNodes?.length ?? 0 } : null;
  const byCategory = (cat: FileCategory) =>
    files
      .filter((f) => f.category === cat)
      .map((f) => ({ id: f._id, name: f.name, size: f.size, storageId: f.storageId }));
  return {
    _id: project._id,
    titel: project.titel,
    start: project.start ?? "",
    einstiegssatz: project.einstiegssatz ?? "",
    benefits: project.benefits,
    ziele: project.ziele,
    sfInput: project.sfInput ?? "",
    // Derived from the fetched doc (not `project.flowId` directly) so a
    // dangling reference to a since-deleted flow reads as unlinked.
    flowId: flow?._id,
    flow,
    wege: wege
      .sort((a, b) => a.order - b.order)
      .map((w) => ({
        id: w._id,
        name: w.name,
        einwaende: w.einwaende,
        benefit: w.benefit ?? "",
        ziele: w.ziele ?? "",
      })),
    files: {
      plan: byCategory("plan"),
      scripte: byCategory("scripte"),
      dateien: byCategory("dateien"),
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const projects = await ctx.db.query("salesCockpitProjects").withIndex("by_createdAt").collect();
    return Promise.all(projects.sort((a, b) => b.createdAt - a.createdAt).map((p) => hydrateProject(ctx, p)));
  },
});

export const createProject = mutation({
  args: projectFieldsValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const projectId = await ctx.db.insert("salesCockpitProjects", {
      titel: args.titel,
      start: args.start,
      einstiegssatz: args.einstiegssatz,
      benefits: args.benefits,
      ziele: args.ziele,
      sfInput: args.sfInput,
      flowId: args.flowId,
      createdByUserId: user._id,
      createdAt: now,
    });
    await replaceFiles(ctx, projectId, user._id, args.files);
    return { id: projectId };
  },
});

export const updateProject = mutation({
  args: { projectId: v.id("salesCockpitProjects"), ...projectFieldsValidator },
  handler: async (ctx, { projectId, ...args }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(projectId);
    if (!existing) throw new ConvexError({ code: "not_found", message: "Projekt nicht gefunden" });
    await ctx.db.patch(projectId, {
      titel: args.titel,
      start: args.start,
      einstiegssatz: args.einstiegssatz,
      benefits: args.benefits,
      ziele: args.ziele,
      sfInput: args.sfInput,
      flowId: args.flowId,
      updatedAt: Date.now(),
    });
    await replaceFiles(ctx, projectId, user._id, args.files);
    return { id: projectId };
  },
});

export const removeProject = mutation({
  args: { projectId: v.id("salesCockpitProjects") },
  handler: async (ctx, { projectId }) => {
    await requireUser(ctx);
    const [wege, files] = await Promise.all([
      ctx.db
        .query("salesCockpitWege")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("salesCockpitFiles")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    ]);
    await Promise.all(wege.map((w) => ctx.db.delete(w._id)));
    await Promise.all(
      files.map(async (f) => {
        await ctx.db.delete(f._id);
        await ctx.storage.delete(f.storageId);
      }),
    );
    await ctx.db.delete(projectId);
    return { ok: true };
  },
});

// --- Lexikon -----------------------------------------------------------------

function toLexikonSummary(entry: Doc<"salesCockpitLexikon">) {
  return {
    _id: entry._id,
    titel: entry.titel,
    tags: entry.tags,
    fileName: entry.fileName,
    storageId: entry.storageId,
    size: entry.size,
    isText: entry.isText,
    createdAt: entry.createdAt,
  };
}

export const listLexikon = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const entries = await ctx.db.query("salesCockpitLexikon").withIndex("by_createdAt").collect();
    return entries.sort((a, b) => b.createdAt - a.createdAt).map(toLexikonSummary);
  },
});

export const uploadLexikon = mutation({
  args: {
    titel: v.string(),
    tags: v.array(v.string()),
    fileName: v.string(),
    storageId: v.id("_storage"),
    size: v.number(),
    isText: v.boolean(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!args.titel.trim()) {
      throw new ConvexError({ code: "bad_request", message: "Bitte einen Titel eingeben" });
    }
    const id = await ctx.db.insert("salesCockpitLexikon", {
      titel: args.titel,
      tags: args.tags,
      fileName: args.fileName,
      storageId: args.storageId,
      size: args.size,
      isText: args.isText,
      content: args.content,
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const removeLexikon = mutation({
  args: { entryId: v.id("salesCockpitLexikon") },
  handler: async (ctx, { entryId }) => {
    await requireUser(ctx);
    const entry = await ctx.db.get(entryId);
    if (!entry) return { ok: false };
    await ctx.db.delete(entryId);
    await ctx.storage.delete(entry.storageId);
    return { ok: true };
  },
});

/** Case-insensitive substring match over title, tags, file name and (for
 *  text files) extracted content — mirrors the prototype's `lexSearchAll`,
 *  scoring and snippet extraction included, just moved server-side. */
export const searchLexikon = query({
  args: { query: v.string() },
  handler: async (ctx, { query: rawQuery }) => {
    await requireUser(ctx);
    const q = rawQuery.trim().toLowerCase();
    if (!q) return [];
    const entries = await ctx.db.query("salesCockpitLexikon").collect();
    const hits = entries.flatMap((e) => {
      let score = 0;
      let snippet = "";
      if (e.titel.toLowerCase().includes(q)) score += 5;
      if (e.tags.some((t) => t.toLowerCase().includes(q))) score += 4;
      if (e.fileName.toLowerCase().includes(q)) score += 2;
      if (e.content) {
        const pos = e.content.toLowerCase().indexOf(q);
        if (pos >= 0) {
          score += 3;
          const start = Math.max(0, pos - 70);
          snippet = `${start > 0 ? "… " : ""}${e.content.slice(start, pos + 130).replace(/\s+/g, " ")} …`;
        }
      }
      return score > 0 ? [{ ...toLexikonSummary(e), score, snippet }] : [];
    });
    return hits.sort((a, b) => b.score - a.score);
  },
});
