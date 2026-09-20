"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { cn } from "@/lib/utils";

import { useAcademySession } from "./session";
import { ACADEMY_ID } from "./use-academy-progress";

/** Below this, a question is worth looking at: either it's badly worded or the
 *  chapter doesn't actually teach the answer. */
const WEAK_THRESHOLD = 0.7;

/**
 * Cohort view: which questions the group gets wrong, which option they pick
 * instead, and where people stop. Deliberately not a wall of stat cards — one
 * number that matters per block and a bar per question, with colour only
 * where it means "below threshold".
 */
export function Analytics() {
  const { academyPin } = useAcademySession();
  const data = useQuery(api.academy.analytics.cohort, {
    academyId: ACADEMY_ID,
    pin: academyPin,
  });
  const [showAll, setShowAll] = useState(false);

  const weakest = useMemo(() => {
    if (!data?.migrated) return [];
    return data.chapters
      .flatMap((chapter) =>
        chapter.questions.map((question) => ({ ...question, chapterTitle: chapter.title })),
      )
      .filter((question) => question.answered > 0)
      .sort((a, b) => a.correct / a.answered - b.correct / b.answered);
  }, [data]);

  if (data === undefined) return <p className="text-sm text-muted-foreground">Lade Auswertung …</p>;
  if (!data.migrated) {
    return (
      <p className="text-sm text-muted-foreground">
        Die Auswertung braucht die Kursinhalte in der Datenbank. Übernimm sie einmalig unter
        Einstellungen — vorher hängen gespeicherte Antworten an der Position einer Frage statt an
        der Frage selbst.
      </p>
    );
  }
  if (data.participants === 0) {
    return <p className="text-sm text-muted-foreground">Noch keine Ergebnisse.</p>;
  }

  const shown = showAll ? weakest : weakest.slice(0, 8);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold">Schwierigste Fragen</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Über {data.participants} {data.participants === 1 ? "Teilnehmer" : "Teilnehmer"} hinweg,
          schlechteste zuerst.
        </p>
        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Noch keine beantworteten Fragen.</p>
        ) : (
          <div className="mt-3 divide-y divide-border/60">
            {shown.map((question) => (
              <QuestionStat key={question.questionId} question={question} />
            ))}
          </div>
        )}
        {weakest.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {showAll ? "Weniger zeigen" : `Alle ${weakest.length} Fragen zeigen`}
          </button>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold">Wo Teilnehmer aufhören</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Wie viele der {data.participants} jedes Kapitel erreicht und den Wissens-Check
          abgeschlossen haben.
        </p>
        <div className="mt-3 space-y-1.5">
          {data.chapters.map((chapter, index) => (
            <div key={chapter.chapterId} className="flex items-center gap-3">
              <span className="w-56 shrink-0 truncate text-xs">
                {index + 1}. {chapter.title}
              </span>
              <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
                <div
                  className="absolute inset-y-0 left-0 bg-foreground/15"
                  style={{ width: `${(chapter.reached / data.participants) * 100}%` }}
                />
                {chapter.hasQuiz && (
                  <div
                    className="absolute inset-y-0 left-0 bg-foreground/45"
                    style={{ width: `${(chapter.quizComplete / data.participants) * 100}%` }}
                  />
                )}
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {chapter.hasQuiz
                  ? `${chapter.quizComplete}/${chapter.reached}`
                  : `${chapter.reached} erreicht`}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Hell = erreicht, dunkel = Wissens-Check abgeschlossen.
        </p>
      </section>
    </div>
  );
}

function QuestionStat({
  question,
}: {
  question: {
    question: string;
    chapterTitle: string;
    options: string[];
    correctIndex: number;
    answered: number;
    correct: number;
    distribution: number[];
  };
}) {
  const rate = question.correct / question.answered;
  const weak = rate < WEAK_THRESHOLD;

  return (
    <div className="py-3">
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 text-sm">{question.question}</p>
        <span
          className={cn(
            "shrink-0 text-sm tabular-nums",
            weak ? "font-medium text-warn" : "text-muted-foreground",
          )}
        >
          {Math.round(rate * 100)} %
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {question.chapterTitle} · {question.correct}/{question.answered} richtig
      </p>
      <div className="mt-2 space-y-1">
        {question.options.map((option, index) => {
          const count = question.distribution[index] ?? 0;
          const share = question.answered ? count / question.answered : 0;
          const isCorrect = index === question.correctIndex;
          return (
            <div key={index} className="flex items-center gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  isCorrect ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {option}
              </span>
              <div className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full", isCorrect ? "bg-success" : "bg-foreground/25")}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
