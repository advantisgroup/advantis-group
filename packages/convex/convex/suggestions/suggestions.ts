import { query, userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { assertAttachmentSizeOk } from "../lib/attachments";
import { notifyUsers } from "../lib/notify";
import { displayName } from "../lib/users";
import {
  attachmentValidator,
  suggestionOutcomeValidator,
  suggestionStatusValidator,
} from "../schema";

export const create = userMutation({
  args: {
    categoryId: v.id("suggestionCategories"),
    title: v.string(),
    explanation: v.optional(v.string()),
    link: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const author = ctx.caller.user;
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

export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const me = ctx.caller.user;
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
        const votes = await ctx.db
          .query("suggestionVotes")
          .withIndex("by_suggestion", (q) => q.eq("suggestionId", s._id))
          .collect();
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
          decisionNote: s.decisionNote ?? null,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt ?? null,
          voteCount: votes.length,
          votedByMe: votes.some((vote) => vote.userId === me._id),
        };
      }),
    );
  },
});

export const update = userMutation({
  role: "manager",
  args: {
    suggestionId: v.id("suggestions"),
    status: v.optional(suggestionStatusValidator),
    // null clears a previously-set outcome.
    outcome: v.optional(v.union(suggestionOutcomeValidator, v.null())),
    decisionNote: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { suggestionId, status, outcome, decisionNote }) => {
    const existing = await ctx.db.get(suggestionId);
    if (!existing) {
      throw new ConvexError({ code: "not_found", message: "Suggestion not found" });
    }
    const nextDecisionNote =
      decisionNote === undefined ? existing.decisionNote : decisionNote?.trim() || undefined;
    const nextStatus = status ?? existing.status;
    const nextOutcome = outcome === undefined ? existing.outcome : (outcome ?? undefined);
    if ((nextStatus === "closed" || nextOutcome) && !nextDecisionNote) {
      throw new ConvexError({
        code: "bad_request",
        message: "A decision note is required when closing a suggestion",
      });
    }
    await ctx.db.patch(suggestionId, {
      ...(status !== undefined ? { status } : {}),
      ...(outcome !== undefined ? { outcome: outcome ?? undefined } : {}),
      ...(decisionNote !== undefined ? { decisionNote: nextDecisionNote } : {}),
      updatedAt: Date.now(),
    });
    if (nextOutcome === "implemented" && existing.outcome !== "implemented") {
      const votes = await ctx.db
        .query("suggestionVotes")
        .withIndex("by_suggestion", (q) => q.eq("suggestionId", suggestionId))
        .collect();
      const recipients = new Set([existing.authorUserId, ...votes.map((vote) => vote.userId)]);
      await notifyUsers(ctx, [...recipients], {
        type: "suggestion",
        title: `Implemented: ${existing.title}`,
        body: nextDecisionNote,
        link: `/suggestions?open=${suggestionId}`,
      });
    }
    return { ok: true };
  },
});

export const toggleVote = userMutation({
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    const user = ctx.caller.user;
    const suggestion = await ctx.db.get(suggestionId);
    if (!suggestion) {
      throw new ConvexError({ code: "not_found", message: "Suggestion not found" });
    }
    const existing = await ctx.db
      .query("suggestionVotes")
      .withIndex("by_suggestion_user", (q) =>
        q.eq("suggestionId", suggestionId).eq("userId", user._id),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { voted: false };
    }
    await ctx.db.insert("suggestionVotes", {
      suggestionId,
      userId: user._id,
      createdAt: Date.now(),
    });
    return { voted: true };
  },
});

export const remove = userMutation({
  role: "manager",
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    const existing = await ctx.db.get(suggestionId);
    if (!existing) return { ok: false };
    for (const a of existing.attachments ?? []) {
      await ctx.storage.delete(a.storageId);
    }
    const votes = await ctx.db
      .query("suggestionVotes")
      .withIndex("by_suggestion", (q) => q.eq("suggestionId", suggestionId))
      .collect();
    await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));
    await ctx.db.delete(suggestionId);
    return { ok: true };
  },
});
