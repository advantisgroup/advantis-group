import { serverQuery, serverUserMutation } from "../functions";
import { ConvexError, v } from "convex/values";
import { getServerCaller } from "../lib/caller";
import { moveToTrash } from "../lib/trash";

/**
 * Server-key gated CRUD for the Sales Coach EV knowledge base. Reads are
 * open to any authenticated intranet user (apps/api's requireAuth already
 * gates the request before it gets here); writes require the caller to be
 * an intranet admin (`role: "admin"` on each builder).
 */

const catValidator = v.union(
  v.literal("Produktdaten"),
  v.literal("Preisliste"),
  v.literal("Technik"),
  v.literal("Argumente"),
  v.literal("Rechtliches"),
  v.literal("Intern"),
  v.literal("Links"),
);

export const list = serverQuery({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("salesCoachEvWiki").collect();
    return articles.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Lets apps/api gate the document-analysis endpoint on the same
 * admin-only rule as every other wiki write. */
export const isAdmin = serverQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => (await getServerCaller(ctx, args.clerkUserId))?.isAdmin ?? false,
});

export const create = serverUserMutation({
  role: "admin",
  args: {
    title: v.string(),
    cat: catValidator,
    tags: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    isLink: v.optional(v.boolean()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileContentType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("salesCoachEvWiki", {
      title: args.title,
      cat: args.cat,
      tags: args.tags,
      body: args.body,
      url: args.url,
      isLink: args.isLink,
      storageId: args.storageId,
      fileName: args.fileName,
      fileContentType: args.fileContentType,
      fileSize: args.fileSize,
      authorClerkUserId: ctx.caller.user.clerkUserId,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const update = serverUserMutation({
  role: "admin",
  args: {
    id: v.id("salesCoachEvWiki"),
    title: v.optional(v.string()),
    cat: v.optional(catValidator),
    tags: v.optional(v.string()),
    body: v.optional(v.string()),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileContentType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    // Drops the current attachment (if any) without replacing it. Ignored
    // when `storageId` is also set — a new file always wins.
    removeFile: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError({ code: "not_found", message: "Article not found" });

    const replacingFile = args.storageId !== undefined;
    const droppingFile = !replacingFile && args.removeFile === true;
    // The old blob is never left orphaned: a replace or an explicit removal
    // both delete whatever was attached before, mirroring how
    // guidebookAttachments.remove owns its own storage cleanup.
    if ((replacingFile || droppingFile) && existing.storageId) {
      await ctx.storage.delete(existing.storageId);
    }

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.cat !== undefined ? { cat: args.cat } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.body !== undefined ? { body: args.body } : {}),
      ...(args.url !== undefined ? { url: args.url } : {}),
      ...(replacingFile
        ? {
            storageId: args.storageId,
            fileName: args.fileName,
            fileContentType: args.fileContentType,
            fileSize: args.fileSize,
          }
        : {}),
      ...(droppingFile
        ? {
            storageId: undefined,
            fileName: undefined,
            fileContentType: undefined,
            fileSize: undefined,
          }
        : {}),
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

export const remove = serverUserMutation({
  role: "admin",
  args: { id: v.id("salesCoachEvWiki") },
  handler: async (ctx, args) => {
    await moveToTrash(ctx, "salesCoachEvWiki", args.id, ctx.caller.id);
    return { deleted: true };
  },
});
