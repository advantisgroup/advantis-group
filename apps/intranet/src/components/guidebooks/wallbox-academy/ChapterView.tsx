"use client";

import { useEffect, useState } from "react";

import { type Id } from "@advantis/convex/dataModel";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { AskTrainer } from "./AskTrainer";
import { CallSimulator } from "./CallSimulator";
import { Glossary } from "./Glossary";
import { markChapterVisited } from "./mutators";
import { downloadChapterPdf } from "./pdf";
import { ProcessDiagram } from "./ProcessDiagram";
import { Quiz } from "./Quiz";
import { Research } from "./Research";

import type { AcademyProgressData, Chapter } from "./types";

export function ChapterView({
  chapters,
  segments,
  index,
  participantId,
  progress,
  onMutate,
  onPrev,
  onNext,
  focusQuestionId,
}: {
  chapters: Chapter[];
  segments: Record<string, string>;
  index: number;
  participantId: Id<"academyParticipants">;
  progress: AcademyProgressData;
  onMutate: (fn: (p: AcademyProgressData) => AcademyProgressData) => void;
  onPrev: () => void;
  onNext: () => void;
  focusQuestionId?: string | null;
}) {
  const chapter = chapters[index];
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!chapter.quiz && !chapter.research && !chapter.sim) {
      onMutate((p) => markChapterVisited(p, chapter.id));
    }
    // Only mark-visited when the chapter itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="mb-2 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge variant="secondary">{segments[chapter.segment]}</Badge>
              <h2 className="mt-2 text-lg font-semibold">
                Kapitel {index + 1}: {chapter.title}
              </h2>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={pdfBusy}
              onClick={async () => {
                setPdfBusy(true);
                try {
                  await downloadChapterPdf(chapter, index, segments[chapter.segment]);
                } finally {
                  setPdfBusy(false);
                }
              }}
            >
              <Download className="size-3.5" />
              PDF
            </Button>
          </div>

          <div className="prose-sm max-w-none space-y-3">
            {chapter.body?.map((block, i) => {
              if (block.type === "diagram") return <ProcessDiagram key={i} />;
              if (block.type === "heading") {
                return (
                  <h3 key={i} className="!mt-5 text-base font-semibold">
                    {block.text}
                  </h3>
                );
              }
              if (block.type === "paragraph") {
                return (
                  <p key={i} className="text-sm leading-relaxed">
                    {block.text}
                  </p>
                );
              }
              if (block.type === "list") {
                return (
                  <ul key={i} className="list-disc space-y-1 pl-5 text-sm">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              }
              if (block.type === "objections") {
                return (
                  <div key={i} className="space-y-2">
                    {block.items.map(([objection, response], j) => (
                      <details
                        key={j}
                        className="rounded-md border border-border bg-card px-3.5 py-2.5"
                      >
                        <summary className="cursor-pointer text-sm font-medium">
                          „{objection}“
                        </summary>
                        <p className="mt-1.5 text-sm text-muted-foreground">{response}</p>
                      </details>
                    ))}
                  </div>
                );
              }
              return null;
            })}

            {chapter.glossary ? <Glossary terms={chapter.glossary} /> : null}
            {chapter.research ? <Research progress={progress} onMutate={onMutate} /> : null}
            {chapter.sim ? <CallSimulator progress={progress} onMutate={onMutate} /> : null}
          </div>
        </CardContent>
      </Card>

      {chapter.quiz ? <Quiz chapter={chapter} progress={progress} onMutate={onMutate} /> : null}

      <AskTrainer
        participantId={participantId}
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        focusQuestionId={focusQuestionId}
      />

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={index === 0} onClick={onPrev}>
          <ArrowLeft className="size-4" />
          Zurück
        </Button>
        <Button variant="ghost" disabled={index === chapters.length - 1} onClick={onNext}>
          Weiter
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
