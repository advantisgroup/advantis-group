import { today } from "./progress";

import type {
  AcademyProgressData,
  CallAttempt,
  Chapter,
  DataKey,
  Scenario,
} from "./types";

function ensureStarted(p: AcademyProgressData): AcademyProgressData {
  return p.started ? p : { ...p, started: today() };
}

export function markChapterVisited(
  progress: AcademyProgressData,
  chapterId: string
): AcademyProgressData {
  if (progress.chapters[chapterId]?.visited) return progress;
  return ensureStarted({
    ...progress,
    chapters: {
      ...progress.chapters,
      [chapterId]: { ...progress.chapters[chapterId], visited: true },
    },
  });
}

export function answerQuizQuestion(
  progress: AcademyProgressData,
  chapter: Chapter,
  questionIndex: number,
  optionIndex: number
): AcademyProgressData {
  if (!chapter.quiz) return progress;
  const existing = progress.chapters[chapter.id] ?? {
    correct: 0,
    total: 0,
    answers: {},
    attempts: 1,
    history: [],
  };
  if (existing.answers?.[questionIndex] !== undefined) return progress;

  const answers = { ...(existing.answers ?? {}), [questionIndex]: optionIndex };
  const correct = chapter.quiz.reduce(
    (sum, q, i) => sum + (answers[i] === q.correctIndex ? 1 : 0),
    0
  );
  const state = {
    ...existing,
    answers,
    correct,
    total: Object.keys(answers).length,
    attempts: existing.attempts ?? 1,
  };
  return ensureStarted({
    ...progress,
    chapters: { ...progress.chapters, [chapter.id]: state },
  });
}

export function retryQuiz(
  progress: AcademyProgressData,
  chapterId: string
): AcademyProgressData {
  const state = progress.chapters[chapterId];
  if (!state) return progress;
  const history = [
    ...(state.history ?? []),
    { correct: state.correct ?? 0, total: state.total ?? 0, date: today() },
  ];
  return {
    ...progress,
    chapters: {
      ...progress.chapters,
      [chapterId]: {
        ...state,
        history,
        attempts: (state.attempts ?? 1) + 1,
        answers: {},
        correct: 0,
        total: 0,
      },
    },
  };
}

export function saveResearchAnswers(
  progress: AcademyProgressData,
  values: Record<string, string>
): AcademyProgressData {
  return ensureStarted({
    ...progress,
    research: { ...progress.research, ...values },
  });
}

export function recordCallAttempt(
  progress: AcademyProgressData,
  scenario: Scenario,
  score: number,
  dataKeys: DataKey[]
): AcademyProgressData {
  const max = scenario.steps.length * 2;
  const prev = progress.calls[scenario.id];
  const attempt: CallAttempt = {
    score,
    max,
    data: dataKeys,
    date: today(),
    attempts: prev ? (prev.attempts ?? 1) + 1 : 1,
    history: prev
      ? [
          ...(prev.history ?? []),
          { score: prev.score, max: prev.max, date: prev.date },
        ]
      : [],
  };
  return ensureStarted({
    ...progress,
    calls: { ...progress.calls, [scenario.id]: attempt },
  });
}

export function setLastChapter(
  progress: AcademyProgressData,
  index: number
): AcademyProgressData {
  return { ...progress, lastCh: index };
}
