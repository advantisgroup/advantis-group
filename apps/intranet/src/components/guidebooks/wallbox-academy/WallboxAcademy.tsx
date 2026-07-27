"use client";

import { useState } from "react";

import { type Id } from "@advantis/convex/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDeepLinkIds } from "@/hooks/use-deep-link-id";

import { ChapterNav } from "./ChapterNav";
import { ChapterView } from "./ChapterView";
import { CHAPTERS } from "./data";
import { Home } from "./Home";
import { setLastChapter } from "./mutators";
import { Overview } from "./Overview";
import { TrainerView } from "./TrainerView";
import { useAcademyProgress } from "./use-academy-progress";

type Screen =
  | { kind: "home" }
  | { kind: "participant"; id: Id<"academyParticipants">; name: string }
  | { kind: "admin" };

export function WallboxSalesAcademyGuidebook() {
  const deepLinks = useDeepLinkIds(["ch", "q", "participant"] as const);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });

  if (screen.kind === "home") {
    return (
      <Home
        onParticipantLogin={p =>
          setScreen({ kind: "participant", id: p.id, name: p.name })
        }
        onAdminLogin={() => setScreen({ kind: "admin" })}
      />
    );
  }

  if (screen.kind === "admin") {
    return (
      <div>
        <WhoBar label="Admin" onLogout={() => setScreen({ kind: "home" })} />
        <TrainerView
          focusParticipantId={deepLinks.participant ?? null}
          focusQuestionId={deepLinks.q ?? null}
        />
      </div>
    );
  }

  return (
    <ParticipantArea
      participantId={screen.id}
      participantName={screen.name}
      onLogout={() => setScreen({ kind: "home" })}
      initialChapterId={deepLinks.ch ?? null}
      focusQuestionId={deepLinks.q ?? null}
    />
  );
}

function WhoBar({ label, onLogout }: { label: string; onLogout: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-end gap-2">
      <Badge>{label}</Badge>
      <Button size="sm" variant="ghost" onClick={onLogout}>
        Abmelden
      </Button>
    </div>
  );
}

type ParticipantView = "overview" | { chapter: number };

function ParticipantArea({
  participantId,
  participantName,
  onLogout,
  initialChapterId,
  focusQuestionId,
}: {
  participantId: Id<"academyParticipants">;
  participantName: string;
  onLogout: () => void;
  initialChapterId: string | null;
  focusQuestionId: string | null;
}) {
  const { progress, loading, mutate } = useAcademyProgress(participantId);
  const [view, setView] = useState<ParticipantView>(() => {
    if (initialChapterId) {
      const index = CHAPTERS.findIndex(c => c.id === initialChapterId);
      if (index >= 0) return { chapter: index };
    }
    return "overview";
  });

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Lade Trainingsstand …</p>
    );
  }

  function openChapter(index: number) {
    setView({ chapter: index });
    void mutate(p => setLastChapter(p, index));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Badge variant="default">{participantName}</Badge>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setView("overview")}>
            Übersicht
          </Button>
          <Button size="sm" variant="ghost" onClick={onLogout}>
            Abmelden
          </Button>
        </div>
      </div>

      {view === "overview" ? (
        <Overview progress={progress} onOpenChapter={openChapter} />
      ) : (
        <div>
          <ChapterNav
            progress={progress}
            current={view.chapter}
            onOverview={() => setView("overview")}
            onSelect={openChapter}
          />
          <ChapterView
            index={view.chapter}
            participantId={participantId}
            progress={progress}
            onMutate={fn => void mutate(fn)}
            onPrev={() => openChapter(Math.max(0, view.chapter - 1))}
            onNext={() =>
              openChapter(Math.min(CHAPTERS.length - 1, view.chapter + 1))
            }
            focusQuestionId={focusQuestionId}
          />
        </div>
      )}
    </div>
  );
}
