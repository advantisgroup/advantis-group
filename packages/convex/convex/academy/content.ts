import { v } from "convex/values";

import { mutation, query } from "../functions";
import { requireAcademyAdmin } from "./lib/auth";

/**
 * Course content lives here once the one-time `migrate` below has run. Before
 * that the frontend falls back to its bundled `data.ts`, which is also what it
 * hands to `migrate` as the seed — the 1300-line file is the source of the
 * content, not the owner of it, and after the migration it is neither.
 *
 * `list` is deliberately public (no `requireUser`), same as
 * `academyQuestions.ask`/`listMine`: a participant reaches the training with
 * an access code and no intranet account at all, and the course text is not
 * secret.
 */

const EMPTY = { migrated: false as const, segments: [], chapters: [] };

export const list = query({
  args: { academyId: v.string() },
  handler: async (ctx, { academyId }) => {
    const status = await ctx.db
      .query("academyContentStatus")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .unique();
    if (!status) return EMPTY;

    const [segments, chapters, questions] = await Promise.all([
      ctx.db
        .query("academySegments")
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

    const quizByChapter = new Map<string, typeof questions>();
    for (const question of questions) {
      if (question.archived) continue;
      const bucket = quizByChapter.get(question.chapterId);
      if (bucket) bucket.push(question);
      else quizByChapter.set(question.chapterId, [question]);
    }

    return {
      migrated: true as const,
      segments: segments
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ key: s.key, label: s.label })),
      chapters: chapters
        .filter((c) => !c.archived)
        .sort((a, b) => a.order - b.order)
        .map((c) => ({
          chapterId: c.chapterId,
          title: c.title,
          segment: c.segment,
          body: c.body,
          glossary: c.glossary ?? null,
          research: c.research ?? false,
          sim: c.sim ?? false,
          quiz: (quizByChapter.get(c.chapterId) ?? [])
            .sort((a, b) => a.order - b.order)
            .map((q) => ({
              questionId: q.questionId,
              question: q.question,
              options: q.options,
              correctIndex: q.correctIndex,
            })),
        })),
    };
  },
});

export const status = query({
  args: { academyId: v.string() },
  handler: async (ctx, { academyId }) => {
    const row = await ctx.db
      .query("academyContentStatus")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .unique();
    return row
      ? {
          migratedAt: row.migratedAt,
          chapterCount: row.chapterCount,
          questionCount: row.questionCount,
          rewrittenResults: row.rewrittenResults,
        }
      : null;
  },
});

export const updateChapter = mutation({
  args: {
    academyId: v.string(),
    pin: v.string(),
    chapterId: v.string(),
    title: v.string(),
    segment: v.string(),
  },
  handler: async (ctx, { academyId, pin, chapterId, title, segment }) => {
    await requireAcademyAdmin(ctx, academyId, pin);
    const chapter = await ctx.db
      .query("academyChapters")
      .withIndex("by_academy_chapter", (q) =>
        q.eq("academyId", academyId).eq("chapterId", chapterId),
      )
      .unique();
    if (!chapter) return;
    await ctx.db.patch(chapter._id, {
      title: title.trim(),
      segment,
      updatedAt: Date.now(),
    });
  },
});

/** The chapter's prose. `body` is the same `ChapterBlock[]` JSON the migration
 *  wrote — the client edits the blocks directly rather than converting them to
 *  HTML and back, which would lose the `objections` and `diagram` types that
 *  have no equivalent in the sanitizer's allowlist. */
export const updateChapterBody = mutation({
  args: {
    academyId: v.string(),
    pin: v.string(),
    chapterId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { academyId, pin, chapterId, body }) => {
    await requireAcademyAdmin(ctx, academyId, pin);
    const chapter = await ctx.db
      .query("academyChapters")
      .withIndex("by_academy_chapter", (q) =>
        q.eq("academyId", academyId).eq("chapterId", chapterId),
      )
      .unique();
    if (!chapter) return;
    // Refuse anything that isn't a parseable array rather than storing a blob
    // the reader will silently render as an empty chapter.
    try {
      if (!Array.isArray(JSON.parse(body))) return;
    } catch {
      return;
    }
    await ctx.db.patch(chapter._id, { body, updatedAt: Date.now() });
  },
});

export const saveQuestion = mutation({
  args: {
    academyId: v.string(),
    pin: v.string(),
    chapterId: v.string(),
    /** Omitted for a new question — the id is minted here and never reused. */
    questionId: v.optional(v.string()),
    question: v.string(),
    options: v.array(v.string()),
    correctIndex: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAcademyAdmin(ctx, args.academyId, args.pin);
    const options = args.options.map((o) => o.trim()).filter(Boolean);
    if (!args.question.trim() || options.length < 2) return null;
    const correctIndex = Math.min(Math.max(args.correctIndex, 0), options.length - 1);
    const now = Date.now();

    if (args.questionId) {
      const existing = await ctx.db
        .query("academyQuizQuestions")
        .withIndex("by_academy_question", (q) =>
          q.eq("academyId", args.academyId).eq("questionId", args.questionId!),
        )
        .unique();
      if (!existing) return null;
      await ctx.db.patch(existing._id, {
        question: args.question.trim(),
        options,
        correctIndex,
        updatedAt: now,
      });
      return existing.questionId;
    }

    const siblings = await ctx.db
      .query("academyQuizQuestions")
      .withIndex("by_academy_chapter", (q) =>
        q.eq("academyId", args.academyId).eq("chapterId", args.chapterId),
      )
      .collect();
    // Time-based rather than "highest order + 1": a retired question keeps its
    // id forever so old results stay resolvable, and reusing that id would
    // silently graft someone's historical answer onto a different question.
    const questionId = `${args.chapterId}-n${now.toString(36)}`;
    await ctx.db.insert("academyQuizQuestions", {
      academyId: args.academyId,
      chapterId: args.chapterId,
      questionId,
      question: args.question.trim(),
      options,
      correctIndex,
      order: siblings.reduce((max, s) => Math.max(max, s.order), -1) + 1,
      updatedAt: now,
    });
    return questionId;
  },
});

/** Retires a question without deleting it — results that reference it have to
 *  stay interpretable, so it only stops being served to participants. */
export const archiveQuestion = mutation({
  args: { academyId: v.string(), pin: v.string(), questionId: v.string() },
  handler: async (ctx, { academyId, pin, questionId }) => {
    await requireAcademyAdmin(ctx, academyId, pin);
    const question = await ctx.db
      .query("academyQuizQuestions")
      .withIndex("by_academy_question", (q) =>
        q.eq("academyId", academyId).eq("questionId", questionId),
      )
      .unique();
    if (question) await ctx.db.patch(question._id, { archived: true, updatedAt: Date.now() });
  },
});

export const reorderQuestions = mutation({
  args: {
    academyId: v.string(),
    pin: v.string(),
    chapterId: v.string(),
    questionIds: v.array(v.string()),
  },
  handler: async (ctx, { academyId, pin, chapterId, questionIds }) => {
    await requireAcademyAdmin(ctx, academyId, pin);
    const questions = await ctx.db
      .query("academyQuizQuestions")
      .withIndex("by_academy_chapter", (q) =>
        q.eq("academyId", academyId).eq("chapterId", chapterId),
      )
      .collect();
    const now = Date.now();
    for (const [order, questionId] of questionIds.entries()) {
      const question = questions.find((q) => q.questionId === questionId);
      if (question && question.order !== order) {
        await ctx.db.patch(question._id, { order, updatedAt: now });
      }
    }
  },
});

/**
 * Rewrites one participant's stored progress from index-keyed answers to
 * question-id-keyed ones.
 *
 * This is the whole reason the migration can't be "copy the content and sort
 * the keying out later": a stored answer is `{ "0": 1 }`, meaning "picked
 * option 1 on whichever question is third in the array". The instant an admin
 * can reorder or delete a question that stops being true, and every historical
 * result silently starts describing a different question — with nothing
 * anywhere to notice it. Done here, while the array order that produced those
 * indices is still the array order in hand, the remap is exact.
 */
function rewriteAnswers(raw: string, idsByChapter: Map<string, string[]>): string | null {
  let parsed: {
    chapters?: Record<string, { answers?: Record<string, number> }>;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return null;
  }
  if (!parsed?.chapters) return null;

  let changed = false;
  for (const [chapterId, chapter] of Object.entries(parsed.chapters)) {
    const ids = idsByChapter.get(chapterId);
    if (!ids || !chapter?.answers) continue;
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(chapter.answers)) {
      const index = Number(key);
      // Already-rewritten keys (a re-run, or a partially migrated row) are
      // left exactly as they are rather than being reinterpreted as indices.
      const id = Number.isInteger(index) ? ids[index] : undefined;
      if (id) {
        next[id] = value;
        changed = true;
      } else {
        next[key] = value;
      }
    }
    chapter.answers = next;
  }
  return changed ? JSON.stringify(parsed) : null;
}

/**
 * One-time, admin-triggered: copies the frontend's bundled course content into
 * the tables above and rewrites existing results onto the new question ids.
 * The client passes the content because `data.ts` lives in the intranet app —
 * this package can't import it, and duplicating 1300 lines of German copy to
 * be able to would just create a second thing to keep in sync.
 *
 * Idempotent by refusing a second run once `academyContentStatus` exists,
 * mirroring `wiki/migration.ts`.
 */
export const migrate = mutation({
  args: {
    academyId: v.string(),
    pin: v.string(),
    segments: v.array(v.object({ key: v.string(), label: v.string() })),
    chapters: v.array(
      v.object({
        chapterId: v.string(),
        title: v.string(),
        segment: v.string(),
        body: v.string(),
        glossary: v.optional(v.string()),
        research: v.optional(v.boolean()),
        sim: v.optional(v.boolean()),
        quiz: v.array(
          v.object({
            question: v.string(),
            options: v.array(v.string()),
            correctIndex: v.number(),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { academyId, pin, segments, chapters }) => {
    const user = await requireAcademyAdmin(ctx, academyId, pin);

    const already = await ctx.db
      .query("academyContentStatus")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .unique();
    if (already) {
      return {
        alreadyDone: true as const,
        chapterCount: already.chapterCount,
        questionCount: already.questionCount,
        rewrittenResults: already.rewrittenResults,
      };
    }

    const now = Date.now();

    for (const [index, segment] of segments.entries()) {
      await ctx.db.insert("academySegments", {
        academyId,
        key: segment.key,
        label: segment.label,
        order: index,
      });
    }

    const idsByChapter = new Map<string, string[]>();
    let questionCount = 0;

    for (const [chapterIndex, chapter] of chapters.entries()) {
      await ctx.db.insert("academyChapters", {
        academyId,
        chapterId: chapter.chapterId,
        title: chapter.title,
        segment: chapter.segment,
        order: chapterIndex,
        body: chapter.body,
        glossary: chapter.glossary,
        research: chapter.research,
        sim: chapter.sim,
        updatedAt: now,
      });

      const ids: string[] = [];
      for (const [questionIndex, question] of chapter.quiz.entries()) {
        const questionId = `${chapter.chapterId}-q${questionIndex + 1}`;
        ids.push(questionId);
        await ctx.db.insert("academyQuizQuestions", {
          academyId,
          chapterId: chapter.chapterId,
          questionId,
          question: question.question,
          options: question.options,
          correctIndex: question.correctIndex,
          order: questionIndex,
          updatedAt: now,
        });
        questionCount++;
      }
      idsByChapter.set(chapter.chapterId, ids);
    }

    const results = await ctx.db
      .query("academyResults")
      .withIndex("by_academy", (q) => q.eq("academyId", academyId))
      .collect();
    let rewrittenResults = 0;
    for (const result of results) {
      const next = rewriteAnswers(result.data, idsByChapter);
      if (next) {
        await ctx.db.patch(result._id, { data: next, updatedAt: now });
        rewrittenResults++;
      }
    }

    await ctx.db.insert("academyContentStatus", {
      academyId,
      migratedAt: now,
      migratedByUserId: user._id,
      chapterCount: chapters.length,
      questionCount,
      rewrittenResults,
    });

    return {
      alreadyDone: false as const,
      chapterCount: chapters.length,
      questionCount,
      rewrittenResults,
    };
  },
});
