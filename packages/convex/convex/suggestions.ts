import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import { assertAttachmentSizeOk } from "./lib/attachments";
import { requireManager, requireUser } from "./lib/auth";
import { displayName } from "./lib/users";
import {
  attachmentValidator,
  suggestionOutcomeValidator,
  suggestionStatusValidator,
} from "./schema";

export const create = mutation({
  args: {
    categoryId: v.id("suggestionCategories"),
    title: v.string(),
    explanation: v.optional(v.string()),
    link: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const author = await requireUser(ctx);
    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({ code: "bad_request", message: "Title required" });
    }
    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "not_found", message: "Category not found" });
    }
    assertAttachmentSizeOk(args.attachments ?? []);
    const id = await ctx.db.insert("suggestions", {
      authorUserId: author._id,
      categoryId: args.categoryId,
      title,
      explanation: args.explanation?.trim() || undefined,
      link: args.link?.trim() || undefined,
      attachments: args.attachments,
      status: "open",
      createdAt: Date.now(),
    });
    await Promise.all(
      (args.attachments ?? []).map((a) =>
        ctx.db.insert("attachmentOwners", {
          storageId: a.storageId,
          kind: "suggestion",
          suggestionId: id,
        }),
      ),
    );
    return { id };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("suggestions")
      .withIndex("by_createdAt")
      .order("desc")
      .take(500);
    const categories = await ctx.db.query("suggestionCategories").collect();
    const categoryById = new Map(categories.map((c) => [c._id, c.name]));
    return Promise.all(
      rows.map(async (s) => {
        const author = await ctx.db.get(s.authorUserId);
        const attachments = await Promise.all(
          (s.attachments ?? []).map(async (a) => ({
            storageId: a.storageId,
            kind: a.kind,
            name: a.name,
            size: a.size ?? null,
            contentType: a.contentType ?? null,
            url: await ctx.storage.getUrl(a.storageId),
          })),
        );
        return {
          _id: s._id,
          authorUserId: s.authorUserId,
          authorName: displayName(author),
          categoryId: s.categoryId,
          categoryName: categoryById.get(s.categoryId) ?? "—",
          title: s.title,
          explanation: s.explanation ?? null,
          link: s.link ?? null,
          attachments,
          status: s.status,
          outcome: s.outcome ?? null,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt ?? null,
        };
      }),
    );
  },
});

export const update = mutation({
  args: {
    suggestionId: v.id("suggestions"),
    status: v.optional(suggestionStatusValidator),
    // null clears a previously-set outcome.
    outcome: v.optional(v.union(suggestionOutcomeValidator, v.null())),
  },
  handler: async (ctx, { suggestionId, status, outcome }) => {
    await requireManager(ctx);
    const existing = await ctx.db.get(suggestionId);
    if (!existing) {
      throw new ConvexError({ code: "not_found", message: "Suggestion not found" });
    }
    await ctx.db.patch(suggestionId, {
      ...(status !== undefined ? { status } : {}),
      ...(outcome !== undefined ? { outcome: outcome ?? undefined } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    await requireManager(ctx);
    const existing = await ctx.db.get(suggestionId);
    if (!existing) return { ok: false };
    for (const a of existing.attachments ?? []) {
      await ctx.storage.delete(a.storageId);
    }
    await ctx.db.delete(suggestionId);
    return { ok: true };
  },
});
