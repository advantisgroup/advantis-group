"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { setLastChapter } from "@/components/guidebooks/wallbox-academy/mutators";
import { Overview } from "@/components/guidebooks/wallbox-academy/Overview";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
import { useAcademyContent } from "@/components/guidebooks/wallbox-academy/use-academy-content";
import { useAcademyProgress } from "@/components/guidebooks/wallbox-academy/use-academy-progress";
import { WhoBar } from "@/components/guidebooks/wallbox-academy/WhoBar";

const HOME = "/wallbox-sales-academy";

export default function TrainingOverviewPage() {
  const router = useRouter();
  const { hydrated, participant, logout } = useAcademySession();

  useEffect(() => {
    if (hydrated && !participant) router.replace(HOME);
  }, [hydrated, participant, router]);

  if (!participant) return null;

  return (
    <TrainingOverview participantId={participant.id} name={participant.name} onLogout={logout} />
  );
}

function TrainingOverview({
  participantId,
  name,
  onLogout,
}: {
  participantId: Id<"academyParticipants">;
  name: string;
  onLogout: () => void;
}) {
  const router = useRouter();
  const { chapters, segments, loading: contentLoading } = useAcademyContent();
  const { progress, loading, mutate } = useAcademyProgress(participantId, chapters);

  if (loading || contentLoading) {
    return <p className="text-sm text-muted-foreground">Lade Trainingsstand …</p>;
  }

  function openChapter(index: number) {
    void mutate((p) => setLastChapter(p, index));
    router.push(`${HOME}/training/${chapters[index].id}`);
  }

  return (
    <div>
      <WhoBar
        label={name}
        onLogout={() => {
          onLogout();
          router.push(HOME);
        }}
      />
      <Overview
        chapters={chapters}
        segments={segments}
        progress={progress}
        onOpenChapter={openChapter}
      />
    </div>
  );
}
