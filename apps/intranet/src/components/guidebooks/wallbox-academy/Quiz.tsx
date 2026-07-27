"use client";

import { Check, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { answerQuizQuestion, retryQuiz } from "./mutators";
import { lastQuizResult } from "./progress";

import type { AcademyProgressData, Chapter } from "./types";

export function Quiz({
  chapter,
  progress,
  onMutate,
}: {
  chapter: Chapter;
  progress: AcademyProgressData;
  onMutate: (fn: (p: AcademyProgressData) => AcademyProgressData) => void;
}) {
  if (!chapter.quiz) return null;
  const state = progress.chapters[chapter.id];
  const answers = state?.answers ?? {};
  const answeredCount = Object.keys(answers).length;
  const attempts = state?.attempts ?? 1;
  const history = state?.history ?? [];
  const complete = answeredCount >= chapter.quiz.length;
  const lastResult = lastQuizResult(state, chapter.quiz.length);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Wissens-Check</h3>
        <span className="text-xs text-muted-foreground">
          Versuch {attempts}
          {history.length
            ? ` · frühere Versuche: ${history.map((h) => `${h.correct}/${h.total}`).join(", ")}`
            : ""}
        </span>
      </div>

      <div className="space-y-4">
        {chapter.quiz.map((question, qi) => {
          const given = answers[qi];
          return (
            <div key={qi} className="rounded-lg bg-muted/40 p-3.5">
              <p className="mb-2 text-sm font-semibold">
                {qi + 1}. {question.question}
              </p>
              <div className="space-y-1.5">
                {question.options.map((option, oi) => {
                  const isCorrect = oi === question.correctIndex;
                  const isChosen = oi === given;
                  const revealed = given !== undefined;
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={revealed}
                      onClick={() => onMutate((p) => answerQuizQuestion(p, chapter, qi, oi))}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        !revealed && "border-border hover:border-ring/60 hover:bg-accent",
                        revealed &&
                          isCorrect &&
                          "border-success/60 bg-success/10 font-medium text-success",
                        revealed &&
                          !isCorrect &&
                          isChosen &&
                          "border-destructive/60 bg-destructive/10 text-destructive",
                        revealed && !isCorrect && !isChosen && "border-border opacity-60",
                      )}
                    >
                      {revealed && isCorrect ? <Check className="size-3.5 shrink-0" /> : null}
                      {revealed && !isCorrect && isChosen ? (
                        <X className="size-3.5 shrink-0" />
                      ) : null}
                      {option}
                    </button>
                  );
                })}
              </div>
              {given !== undefined ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {given === question.correctIndex
                    ? "Richtig!"
                    : "Nicht ganz - die grün markierte Antwort ist die stärkste im Kundengespräch."}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {complete ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Badge variant={lastResult.correct / chapter.quiz.length >= 0.7 ? "success" : "warning"}>
            Ergebnis: {state?.correct ?? 0}/{chapter.quiz.length} richtig (Versuch {attempts})
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onMutate((p) => retryQuiz(p, chapter.id))}
          >
            <RotateCcw className="size-3.5" />
            Quiz wiederholen
          </Button>
        </div>
      ) : null}
    </div>
  );
}
