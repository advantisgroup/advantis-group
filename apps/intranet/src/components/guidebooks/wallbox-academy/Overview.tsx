"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SCENARIOS } from "./data";
import {
  chapterResultLabel,
  chapterStatus,
  countResearchAnswered,
  isChapterDone,
  totalQuizScore,
} from "./progress";

import type { AcademyProgressData, Chapter } from "./types";

const STATUS_LABEL: Record<"done" | "started" | "open", string> = {
  done: "erledigt",
  started: "begonnen",
  open: "offen",
};

/**
 * The participant's own view of the course. It used to be five bordered stat
 * boxes over a table of badges — a dashboard shape for what is really a
 * syllabus, and three of the five numbers read 0 on day one. Now it's one
 * progress line, then the chapters as plain rows, with the chapter to continue
 * from as the only filled button on the page.
 */
export function Overview({
  chapters,
  segments,
  progress,
  onOpenChapter,
}: {
  chapters: Chapter[];
  segments: Record<string, string>;
  progress: AcademyProgressData;
  onOpenChapter: (index: number) => void;
}) {
  const done = chapters.filter((c) => isChapterDone(progress, c)).length;
  const pct = chapters.length ? Math.round((done / chapters.length) * 100) : 0;
  const quizScore = totalQuizScore(progress, chapters);
  const quizPct = quizScore.total ? Math.round((quizScore.correct / quizScore.total) * 100) : null;
  const nSim = Object.keys(progress.calls).length;
  const research = countResearchAnswered(progress.research);
  const nextChapter = Math.min(progress.lastCh ?? 0, chapters.length - 1);

  const summary = [
    `${done} von ${chapters.length} Kapiteln`,
    quizPct === null ? null : `${quizPct} % im Wissens-Check`,
    nSim > 0 ? `${nSim}/${SCENARIOS.length} Call-Szenarien` : null,
    research.answered > 0 ? `${research.answered}/${research.total} Recherchefragen` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight">Dein Training</h2>
          <p className="mt-1 text-sm text-muted-foreground">{summary.join(" · ")}</p>
          <div className="mt-3 h-1 w-full max-w-sm overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button className="shrink-0" onClick={() => onOpenChapter(nextChapter)}>
          Weiterlernen: Kapitel {nextChapter + 1}
        </Button>
      </div>

      <div className="-mx-3 divide-y divide-border/50">
        {chapters.map((chapter, index) => {
          const status = chapterStatus(progress, chapter);
          const isNext = index === nextChapter;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onOpenChapter(index)}
              className="flex w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
            >
              <span
                className={cn(
                  "w-5 shrink-0 text-xs tabular-nums",
                  status === "done" ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    isNext ? "font-medium text-foreground" : "text-foreground",
                  )}
                >
                  {chapter.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {segments[chapter.segment]} · {STATUS_LABEL[status]}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {chapterResultLabel(progress, chapter)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
