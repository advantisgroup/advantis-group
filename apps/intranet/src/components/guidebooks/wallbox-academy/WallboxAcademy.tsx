"use client";

import { useState } from "react";

import { useIsManager } from "@/components/providers/current-user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ChapterNav } from "./ChapterNav";
import { ChapterView } from "./ChapterView";
import { CHAPTERS } from "./data";
import { setLastChapter } from "./mutators";
import { Overview } from "./Overview";
import { TrainerView } from "./TrainerView";
import { useAcademyProgress } from "./use-academy-progress";

type View = "overview" | { chapter: number };

export function WallboxSalesAcademyGuidebook() {
  const isManager = useIsManager();

  if (!isManager) return <TrainingArea />;

  return (
    <Tabs defaultValue="training">
      <TabsList>
        <TabsTrigger value="training">Training</TabsTrigger>
        <TabsTrigger value="trainer">Trainer-Bereich</TabsTrigger>
      </TabsList>
      <TabsContent value="training">
        <TrainingArea />
      </TabsContent>
      <TabsContent value="trainer">
        <TrainerView />
      </TabsContent>
    </Tabs>
  );
}

function TrainingArea() {
  const { progress, loading, mutate } = useAcademyProgress();
  const [view, setView] = useState<View>("overview");

  if (loading) {
    return <p className="text-sm text-muted-foreground">Lade Trainingsstand …</p>;
  }

  function openChapter(index: number) {
    setView({ chapter: index });
    void mutate(p => setLastChapter(p, index));
  }

  if (view === "overview") {
    return <Overview progress={progress} onOpenChapter={openChapter} />;
  }

  return (
    <div>
      <ChapterNav
        progress={progress}
        current={view.chapter}
        onOverview={() => setView("overview")}
        onSelect={openChapter}
      />
      <ChapterView
        index={view.chapter}
        progress={progress}
        onMutate={fn => void mutate(fn)}
        onPrev={() => openChapter(Math.max(0, view.chapter - 1))}
        onNext={() => openChapter(Math.min(CHAPTERS.length - 1, view.chapter + 1))}
      />
    </div>
  );
}
