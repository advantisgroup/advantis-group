"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { CHAPTERS } from "@/components/guidebooks/wallbox-academy/data";
import { setLastChapter } from "@/components/guidebooks/wallbox-academy/mutators";
import { Overview } from "@/components/guidebooks/wallbox-academy/Overview";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
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
    <TrainingOverview
      participantId={participant.id}
      name={participant.name}
      onLogout={logout}
    />
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
  const { progress, loading, mutate } = useAcademyProgress(participantId);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Lade Trainingsstand …</p>
    );
  }

  function openChapter(index: number) {
    void mutate(p => setLastChapter(p, index));
    router.push(`${HOME}/training/${CHAPTERS[index].id}`);
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
      <Overview progress={progress} onOpenChapter={openChapter} />
    </div>
  );
}
