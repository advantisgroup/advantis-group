"use client";

import { useEffect } from "react";

import { useParams, useRouter } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { ChapterNav } from "@/components/guidebooks/wallbox-academy/ChapterNav";
import { ChapterView } from "@/components/guidebooks/wallbox-academy/ChapterView";
import { CHAPTERS } from "@/components/guidebooks/wallbox-academy/data";
import { setLastChapter } from "@/components/guidebooks/wallbox-academy/mutators";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
import { useAcademyProgress } from "@/components/guidebooks/wallbox-academy/use-academy-progress";
import { useReadQueryParam } from "@/components/guidebooks/wallbox-academy/use-read-query-param";
import { WhoBar } from "@/components/guidebooks/wallbox-academy/WhoBar";
import { Card, CardContent } from "@/components/ui/card";

const HOME = "/wallbox-sales-academy";

export default function TrainingChapterPage() {
  const router = useRouter();
  const params = useParams<{ chapterId: string }>();
  const focusQuestionId = useReadQueryParam("q");
  const { hydrated, participant, logout } = useAcademySession();

  useEffect(() => {
    if (hydrated && !participant) router.replace(HOME);
  }, [hydrated, participant, router]);

  if (!participant) return null;

  const index = CHAPTERS.findIndex((c) => c.id === params.chapterId);
  if (index < 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Kapitel nicht gefunden.
        </CardContent>
      </Card>
    );
  }

  return (
    <ChapterPage
      participantId={participant.id}
      participantName={participant.name}
      index={index}
      focusQuestionId={focusQuestionId}
      onLogout={logout}
    />
  );
}

function ChapterPage({
  participantId,
  participantName,
  index,
  focusQuestionId,
  onLogout,
}: {
  participantId: Id<"academyParticipants">;
  participantName: string;
  index: number;
  focusQuestionId: string | null;
  onLogout: () => void;
}) {
  const router = useRouter();
  const { progress, loading, mutate } = useAcademyProgress(participantId);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Lade Trainingsstand …</p>;
  }

  function goToChapter(i: number) {
    void mutate((p) => setLastChapter(p, i));
    router.push(`${HOME}/training/${CHAPTERS[i].id}`);
  }

  return (
    <div>
      <WhoBar
        label={participantName}
        onLogout={() => {
          onLogout();
          router.push(HOME);
        }}
      />
      <ChapterNav
        progress={progress}
        current={index}
        onOverview={() => router.push(`${HOME}/training`)}
        onSelect={goToChapter}
      />
      <ChapterView
        index={index}
        participantId={participantId}
        progress={progress}
        onMutate={(fn) => void mutate(fn)}
        onPrev={() => goToChapter(Math.max(0, index - 1))}
        onNext={() => goToChapter(Math.min(CHAPTERS.length - 1, index + 1))}
        focusQuestionId={focusQuestionId}
      />
    </div>
  );
}
