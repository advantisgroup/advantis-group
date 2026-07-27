import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireManager, requireUser } from "./lib/auth";

export const ask = mutation({
  args: {
    academyId: v.string(),
    chapterId: v.string(),
    chapterTitle: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const text = args.text.trim();
    if (!text) return;
    await ctx.db.insert("academyQuestions", {
      userId: user._id,
      academyId: args.academyId,
      chapterId: args.chapterId,
      chapterTitle: args.chapterTitle,
      text,
      answered: false,
      createdAt: Date.now(),
    });
  },
});

export const listMine = query({
  args: { academyId: v.string() },
  handler: async (ctx, { academyId }) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("academyQuestions")
      .withIndex("by_user_academy", q =>
        q.eq("userId", user._id).eq("academyId", academyId)
      )
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Trainer dashboard: every question for an academy, across all participants. */
export const listAll = query({
  args: { academyId: v.string() },
  handler: async (ctx, { academyId }) => {
    await requireManager(ctx);
    const rows = await ctx.db
      .query("academyQuestions")
      .withIndex("by_academy", q => q.eq("academyId", academyId))
      .collect();
    const withNames = await Promise.all(
      rows.map(async row => {
        const user = await ctx.db.get(row.userId);
        return {
          ...row,
          participantName: user
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
              user.email
            : "—",
        };
      })
    );
    return withNames.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const answer = mutation({
  args: { questionId: v.id("academyQuestions"), answer: v.string() },
  handler: async (ctx, { questionId, answer }) => {
    await requireManager(ctx);
    const trimmed = answer.trim();
    await ctx.db.patch(questionId, {
      answer: trimmed,
      answered: trimmed.length > 0,
      answeredAt: Date.now(),
    });
  },
});

export const reopen = mutation({
  args: { questionId: v.id("academyQuestions") },
  handler: async (ctx, { questionId }) => {
    await requireManager(ctx);
    await ctx.db.patch(questionId, { answered: false });
  },
});
