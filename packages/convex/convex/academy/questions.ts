import { mutation, query } from "../functions";
import { v } from "convex/values";

import { requireAcademyAdmin } from "./settings";
import { createNotification } from "../lib/notify";

// ask/listMine are deliberately public (no `requireUser`) — same reasoning
// as academyResults.getMine/saveMine: the participantId is only reachable
// after resolving an access code, which is the real gate for account-less
// participants.

export const ask = mutation({
  args: {
    academyId: v.string(),
    participantId: v.id("academyParticipants"),
    chapterId: v.string(),
    chapterTitle: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) return null;
    return ctx.db.insert("academyQuestions", {
      participantId: args.participantId,
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
  args: { participantId: v.id("academyParticipants") },
  handler: async (ctx, { participantId }) => {
    const rows = await ctx.db
      .query("academyQuestions")
      .withIndex("by_participant", (q) => q.eq("participantId", participantId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Trainer area: every question for the academy, across all participants. */
export const listAll = query({
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireAcademyAdmin(ctx, academyId, pin);
    const rows = await ctx.db
      .query("academyQuestions")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .collect();
    const withNames = await Promise.all(
      rows.map(async (row) => {
        const participant = await ctx.db.get(row.participantId);
        return { ...row, participantName: participant?.name ?? "—" };
      }),
    );
    return withNames.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const answer = mutation({
  args: { questionId: v.id("academyQuestions"), answer: v.string(), pin: v.string() },
  handler: async (ctx, { questionId, answer, pin }) => {
    const question = await ctx.db.get(questionId);
    if (!question) return;
    await requireAcademyAdmin(ctx, question.academyId, pin);
    const trimmed = answer.trim();
    await ctx.db.patch(questionId, {
      answer: trimmed,
      answered: trimmed.length > 0,
      answeredAt: Date.now(),
    });

    // Only reachable if the participant was linked to an intranet account —
    // an unlinked, code-only participant has no `userId` to notify.
    if (trimmed.length > 0) {
      const participant = await ctx.db.get(question.participantId);
      if (participant?.linkedUserId) {
        await createNotification(ctx, {
          userId: participant.linkedUserId,
          type: "academy_answer",
          title: "Deine Frage wurde beantwortet",
          body: question.text,
          link: `/wallbox-sales-academy/training/${question.chapterId}?q=${questionId}`,
        });
      }
    }
  },
});

export const reopen = mutation({
  args: { questionId: v.id("academyQuestions"), pin: v.string() },
  handler: async (ctx, { questionId, pin }) => {
    const question = await ctx.db.get(questionId);
    if (!question) return;
    await requireAcademyAdmin(ctx, question.academyId, pin);
    await ctx.db.patch(questionId, { answered: false });
  },
});
