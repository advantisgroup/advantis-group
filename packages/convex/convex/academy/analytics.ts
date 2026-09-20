import { v } from "convex/values";

import { query } from "../functions";
import { requireAcademyAdmin } from "./lib/auth";

/**
 * Cohort-level stats for the Trainer area — the questions a trainer actually
 * has ("which question does everyone get wrong", "where do people stop")
 * which nothing in the app could answer before. All of it comes out of data
 * that was already being stored and never read back.
 *
 * Computed here rather than in the component: the per-participant blobs would
 * otherwise all be shipped to the browser and re-parsed on every render, which
 * is fine for twenty participants and not for two hundred.
 *
 * Only meaningful once the content migration has run — before that a stored
 * answer is keyed by array position, so "question 3" means a different thing
 * in each participant's blob depending on when they took it.
 */

interface StoredProgress {
  chapters?: Record<
    string,
    { visited?: boolean; answers?: Record<string, number>; total?: number }
  >;
}

export const cohort = query({
  args: { academyId: v.string(), pin: v.string() },
  handler: async (ctx, { academyId, pin }) => {
    await requireAcademyAdmin(ctx, academyId, pin);

    const migrated = await ctx.db
      .query("academyContentStatus")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .unique();
    if (!migrated) return { migrated: false as const, participants: 0, chapters: [] };

    const [results, chapters, questions] = await Promise.all([
      ctx.db
        .query("academyResults")
        .withIndex("by_academy", (q) => q.eq("academyId", academyId))
        .collect(),
      ctx.db
        .query("academyChapters")
        .withIndex("by_academy", (q) => q.eq("academyId", academyId))
        .collect(),
      ctx.db
        .query("academyQuizQuestions")
        .withIndex("by_academy", (q) => q.eq("academyId", academyId))
        .collect(),
    ]);

    const progressByParticipant = results.map((row) => {
      try {
        return JSON.parse(row.data) as StoredProgress;
      } catch {
        return {} as StoredProgress;
      }
    });

    const liveQuestions = questions.filter((q) => !q.archived);
    const questionsByChapter = new Map<string, typeof liveQuestions>();
    for (const question of liveQuestions) {
      const bucket = questionsByChapter.get(question.chapterId);
      if (bucket) bucket.push(question);
      else questionsByChapter.set(question.chapterId, [question]);
    }

    const chapterStats = chapters
      .filter((c) => !c.archived)
      .sort((a, b) => a.order - b.order)
      .map((chapter) => {
        const chapterQuestions = (questionsByChapter.get(chapter.chapterId) ?? []).sort(
          (a, b) => a.order - b.order,
        );

        let reached = 0;
        let quizComplete = 0;
        for (const progress of progressByParticipant) {
          const state = progress.chapters?.[chapter.chapterId];
          if (!state) continue;
          if (state.visited || Object.keys(state.answers ?? {}).length > 0) reached++;
          if (chapterQuestions.length > 0 && (state.total ?? 0) >= chapterQuestions.length) {
            quizComplete++;
          }
        }

        return {
          chapterId: chapter.chapterId,
          title: chapter.title,
          segment: chapter.segment,
          reached,
          quizComplete,
          hasQuiz: chapterQuestions.length > 0,
          questions: chapterQuestions.map((question) => {
            // One bucket per option, so a distractor everyone picks is visible
            // — that usually means the chapter is ambiguous, not that people
            // failed.
            const distribution = question.options.map(() => 0);
            let answered = 0;
            for (const progress of progressByParticipant) {
              const given = progress.chapters?.[chapter.chapterId]?.answers?.[question.questionId];
              if (given === undefined || given < 0 || given >= distribution.length) continue;
              distribution[given]++;
              answered++;
            }
            return {
              questionId: question.questionId,
              question: question.question,
              options: question.options,
              correctIndex: question.correctIndex,
              answered,
              correct: distribution[question.correctIndex] ?? 0,
              distribution,
            };
          }),
        };
      });

    return {
      migrated: true as const,
      participants: results.length,
      chapters: chapterStats,
    };
  },
});
