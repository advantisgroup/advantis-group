"use client";

import { useRouter } from "next/navigation";

import { ParticipantLogin } from "@/components/guidebooks/wallbox-academy/ParticipantLogin";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";
import { useAcademyContent } from "@/components/guidebooks/wallbox-academy/use-academy-content";

/**
 * The front door for an invited participant, who may well not work here — a
 * candidate or a partner following a link from an email. It used to be a
 * heading, one grey line and a boxed form, which is a form with a caption
 * rather than a page. It now says what the training actually is before asking
 * for anything.
 */
export default function WallboxAcademyPublicHomePage() {
  const router = useRouter();
  const { loginParticipant } = useAcademySession();
  const { chapters } = useAcademyContent();

  const quizCount = chapters.reduce((sum, c) => sum + (c.quiz?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-xl py-10">
      <p className="text-sm font-medium text-muted-foreground">Advantis Group</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
        Wallbox Sales Academy
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Das Onboarding-Training für den B2B-Vertrieb von Ladeinfrastruktur: Markt und Technik,
        Prozess und Kosten, Recht und Abrechnung — und wie du das im Kundengespräch einsetzt.
      </p>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-y border-border/70 py-4">
        <div>
          <dt className="text-xs text-muted-foreground">Kapitel</dt>
          <dd className="font-display text-xl font-semibold tabular-nums">{chapters.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Wissens-Check</dt>
          <dd className="font-display text-xl font-semibold tabular-nums">{quizCount} Fragen</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Dazu</dt>
          <dd className="font-display text-xl font-semibold">Call-Simulator</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-muted-foreground">
        Du brauchst kein Konto. Dein Fortschritt wird gespeichert — du kannst jederzeit unterbrechen
        und später weitermachen.
      </p>

      <div className="mt-8">
        <ParticipantLogin
          onLogin={(p) => {
            loginParticipant(p);
            router.push("/wallbox-sales-academy/training");
          }}
        />
      </div>
    </div>
  );
}
