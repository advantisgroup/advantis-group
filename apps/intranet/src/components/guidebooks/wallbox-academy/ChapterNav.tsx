"use client";

import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { isChapterDone } from "./progress";

import type { AcademyProgressData, Chapter } from "./types";

function shortTitle(title: string): string {
  return title.split(":")[0].split(" - ")[0];
}

export function ChapterNav({
  chapters,
  progress,
  current,
  onOverview,
  onSelect,
}: {
  chapters: Chapter[];
  progress: AcademyProgressData;
  current: number;
  onOverview: () => void;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" onClick={onOverview}>
        <Home className="size-3.5" />
        Übersicht
      </Button>
      {chapters.map((chapter, index) => {
        const done = isChapterDone(progress, chapter);
        const active = index === current;
        return (
          <Button
            key={chapter.id}
            size="sm"
            variant={active ? "default" : "outline"}
            className={cn(!active && done && "border-success/50 text-success")}
            onClick={() => onSelect(index)}
          >
            {index + 1}. {shortTitle(chapter.title)}
          </Button>
        );
      })}
    </div>
  );
}
