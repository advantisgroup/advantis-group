import { CHAPTERS, DLAB, RESEARCH_TASKS, SCENARIOS, SEG } from "./data";
import {
  type AcademyProgressData,
  type CallAttempt,
  type Chapter,
  type ChapterProgress,
  EMPTY_PROGRESS,
  type SegmentKey,
} from "./types";

export function today(): string {
  return new Date().toLocaleDateString("de-DE");
}

/** Most recent attempt's score for a quiz chapter (falls back to the live one). */
export function lastQuizResult(
  state: ChapterProgress | undefined,
  quizLength: number
): { correct: number; total: number } {
  if (!state) return { correct: 0, total: 0 };
  if ((state.total ?? 0) >= quizLength) {
    return { correct: state.correct ?? 0, total: state.total ?? 0 };
  }
  if (state.history?.length) {
    const h = state.history[state.history.length - 1];
    return { correct: h.correct, total: h.total };
  }
  return { correct: state.correct ?? 0, total: state.total ?? 0 };
}

export function countResearchAnswered(research: Record<string, string>): {
  answered: number;
  total: number;
} {
  let answered = 0;
  let total = 0;
  RESEARCH_TASKS.forEach(task => {
    task.questions.forEach((_, i) => {
      total++;
      if ((research[`${task.id}_${i}`] ?? "").trim()) answered++;
    });
  });
  return { answered, total };
}

export function isChapterDone(
  progress: AcademyProgressData,
  chapter: Chapter
): boolean {
  if (chapter.sim) {
    return Object.keys(progress.calls).length > 0;
  }
  if (chapter.research) {
    return countResearchAnswered(progress.research).answered > 0;
  }
  if (!chapter.quiz) {
    return !!progress.chapters[chapter.id]?.visited;
  }
  const state = progress.chapters[chapter.id];
  return !!(
    state &&
    ((state.total ?? 0) >= chapter.quiz.length || state.history?.length)
  );
}

export type ChapterStatus = "done" | "started" | "open";

export function chapterStatus(
  progress: AcademyProgressData,
  chapter: Chapter
): ChapterStatus {
  if (isChapterDone(progress, chapter)) return "done";
  if (chapter.research) {
    const { answered } = countResearchAnswered(progress.research);
    if (answered > 0) return "started";
  } else if (chapter.sim) {
    if (Object.keys(progress.calls).length > 0) return "started";
  } else {
    const state = progress.chapters[chapter.id];
    if (state && (state.visited || Object.keys(state.answers ?? {}).length)) {
      return "started";
    }
  }
  return "open";
}

export function chapterResultLabel(
  progress: AcademyProgressData,
  chapter: Chapter
): string {
  if (chapter.quiz) {
    const state = progress.chapters[chapter.id];
    if (!state) return "–";
    const { correct, total } = lastQuizResult(state, chapter.quiz.length);
    const attempts = state.attempts ?? 1;
    const base = total
      ? `${correct}/${chapter.quiz.length} richtig`
      : `0/${chapter.quiz.length}`;
    const attemptsSuffix =
      attempts > 1 || state.history?.length ? ` · Versuch ${attempts}` : "";
    return base + attemptsSuffix;
  }
  if (chapter.sim) {
    const n = Object.keys(progress.calls).length;
    if (!n) return "–";
    const attempts = Object.values(progress.calls).reduce(
      (sum, d) => sum + (d.attempts ?? 1),
      0
    );
    return `${n}/${SCENARIOS.length} Szenarien · ${attempts} Versuch${attempts === 1 ? "" : "e"}`;
  }
  if (chapter.research) {
    const { answered, total } = countResearchAnswered(progress.research);
    return answered ? `${answered}/${total} Antworten` : "–";
  }
  return progress.chapters[chapter.id] ? "gelesen" : "–";
}

export function totalQuizScore(progress: AcademyProgressData): {
  correct: number;
  total: number;
} {
  let correct = 0;
  let total = 0;
  CHAPTERS.forEach(chapter => {
    if (!chapter.quiz) return;
    const { correct: c, total: t } = lastQuizResult(
      progress.chapters[chapter.id],
      chapter.quiz.length
    );
    correct += c;
    total += t;
  });
  return { correct, total };
}

interface SegmentStat {
  correct: number;
  total: number;
  max: number;
}

export function segmentStats(
  progress: AcademyProgressData
): Record<SegmentKey, SegmentStat> {
  const out = Object.fromEntries(
    (Object.keys(SEG) as SegmentKey[]).map(key => [
      key,
      { correct: 0, total: 0, max: 0 },
    ])
  ) as Record<SegmentKey, SegmentStat>;

  CHAPTERS.forEach(chapter => {
    if (!chapter.quiz) return;
    const { correct, total } = lastQuizResult(
      progress.chapters[chapter.id],
      chapter.quiz.length
    );
    out[chapter.segment].correct += correct;
    out[chapter.segment].total += total;
    out[chapter.segment].max += chapter.quiz.length;
  });

  const callsMax = SCENARIOS.reduce((sum, s) => sum + s.steps.length * 2, 0);
  out.calls.max += callsMax;
  SCENARIOS.forEach(scenario => {
    const attempt: CallAttempt | undefined = progress.calls[scenario.id];
    if (attempt) {
      out.calls.correct += attempt.score;
      out.calls.total += attempt.max;
    }
  });

  return out;
}

export interface Recommendation {
  segmentLabel: string;
  reason: string;
  level: "err" | "warn";
}

/** Mirrors the original tool's per-participant "what still needs work" list. */
export function recommendations(
  progress: AcademyProgressData
): Recommendation[] {
  const stats = segmentStats(progress);
  const out: Recommendation[] = [];

  (Object.keys(stats) as SegmentKey[]).forEach(key => {
    const s = stats[key];
    if (!s.max) return;
    if (s.total === 0) {
      out.push({
        segmentLabel: SEG[key],
        reason: "noch nicht bearbeitet",
        level: "err",
      });
    } else if (s.total < s.max) {
      out.push({
        segmentLabel: SEG[key],
        reason: `Wissens-Check unvollständig (${s.total}/${s.max})`,
        level: "warn",
      });
    } else if (s.correct / s.total < 0.7) {
      out.push({
        segmentLabel: SEG[key],
        reason: `Vertiefung empfohlen (${s.correct}/${s.total} richtig, unter 70 %)`,
        level: "warn",
      });
    }
  });

  const { answered, total } = countResearchAnswered(progress.research);
  if (answered === 0) {
    out.push({
      segmentLabel: SEG.praxis,
      reason: "Rechercheaufgaben noch offen",
      level: "err",
    });
  } else if (answered < total) {
    out.push({
      segmentLabel: SEG.praxis,
      reason: `Recherche unvollständig (${answered}/${total} beantwortet)`,
      level: "warn",
    });
  }

  return out;
}

export function parseProgress(
  raw: string | null | undefined
): AcademyProgressData {
  if (!raw) return structuredClone(EMPTY_PROGRESS);
  try {
    const parsed = JSON.parse(raw) as Partial<AcademyProgressData>;
    return {
      chapters: parsed.chapters ?? {},
      research: parsed.research ?? {},
      calls: parsed.calls ?? {},
      lastCh: parsed.lastCh,
      started: parsed.started,
      finished: parsed.finished,
    };
  } catch {
    return structuredClone(EMPTY_PROGRESS);
  }
}

export { DLAB, SEG };
