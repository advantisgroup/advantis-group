import { query, userQuery, userMutation } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Doc } from "../_generated/dataModel";

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

export const listLexikon = userQuery({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("salesCockpitLexikon").withIndex("by_createdAt").collect();
    return entries.sort((a, b) => b.createdAt - a.createdAt).map(toLexikonSummary);
  },
});

export const uploadLexikon = userMutation({
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
    const user = ctx.caller.user;
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

export const removeLexikon = userMutation({
  args: { entryId: v.id("salesCockpitLexikon") },
  handler: async (ctx, { entryId }) => {
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
export const searchLexikon = userQuery({
  args: { query: v.string() },
  handler: async (ctx, { query: rawQuery }) => {
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
