"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { CHAPTERS, SCENARIOS, SEG } from "./data";
import {
  chapterResultLabel,
  chapterStatus,
  countResearchAnswered,
  isChapterDone,
  totalQuizScore,
} from "./progress";

import type { AcademyProgressData } from "./types";

const STATUS_LABEL: Record<"done" | "started" | "open", string> = {
  done: "erledigt",
  started: "begonnen",
  open: "offen",
};

const STATUS_VARIANT: Record<"done" | "started" | "open", "success" | "secondary" | "warning"> = {
  done: "success",
  started: "secondary",
  open: "warning",
};

export function Overview({
  progress,
  onOpenChapter,
}: {
  progress: AcademyProgressData;
  onOpenChapter: (index: number) => void;
}) {
  const done = CHAPTERS.filter((c) => isChapterDone(progress, c)).length;
  const open = CHAPTERS.length - done;
  const pct = Math.round((done / CHAPTERS.length) * 100);
  const quizScore = totalQuizScore(progress);
  const nSim = Object.keys(progress.calls).length;
  const research = countResearchAnswered(progress.research);
  const nextChapter = Math.min(progress.lastCh ?? 0, CHAPTERS.length - 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Deine Lernübersicht</h2>
          <p className="text-sm text-muted-foreground">
            Dein Fortschritt wird automatisch mit deinem Intranet-Konto gespeichert — du kannst
            jederzeit unterbrechen und später weitermachen. Wiederholungen sind beliebig möglich;
            alle Versuche bleiben für den Trainer sichtbar.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => onOpenChapter(nextChapter)}>
          Weiterlernen: Kapitel {nextChapter + 1}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Fortschritt" value={`${pct} %`}>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </StatCard>
        <StatCard label="Kapitel" value={`${done} erledigt`} hint={`${open} offen`} />
        <StatCard
          label="Wissens-Check"
          value={
            quizScore.total ? `${Math.round((quizScore.correct / quizScore.total) * 100)} %` : "–"
          }
          hint={`${quizScore.correct}/${quizScore.total || 0} richtig`}
        />
        <StatCard
          label="Call-Simulator"
          value={`${nSim}/${SCENARIOS.length}`}
          hint="Szenarien absolviert"
        />
        <StatCard
          label="Recherche"
          value={`${research.answered}/${research.total}`}
          hint="Fragen beantwortet"
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 font-semibold">Alle Module</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modul</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ergebnis</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {CHAPTERS.map((chapter, index) => {
                const status = chapterStatus(progress, chapter);
                return (
                  <TableRow key={chapter.id}>
                    <TableCell>
                      <div className="font-medium">
                        {index + 1}. {chapter.title}
                      </div>
                      <Badge variant="secondary" className="mt-1">
                        {SEG[chapter.segment]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {chapterResultLabel(progress, chapter)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={index === nextChapter ? "default" : "outline"}
                        onClick={() => onOpenChapter(index)}
                      >
                        Öffnen
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("p-4")}>
      <CardContent className="p-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {children}
      </CardContent>
    </Card>
  );
}
