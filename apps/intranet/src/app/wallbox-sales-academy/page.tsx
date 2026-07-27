"use client";

import { useRouter } from "next/navigation";

import { ParticipantLogin } from "@/components/guidebooks/wallbox-academy/ParticipantLogin";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";

export default function WallboxAcademyPublicHomePage() {
  const router = useRouter();
  const { loginParticipant } = useAcademySession();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Wallbox Sales Academy</h1>
        <p className="text-sm text-muted-foreground">
          B2B-Vertriebstraining Ladeinfrastruktur.
        </p>
      </div>
      <ParticipantLogin
        onLogin={p => {
          loginParticipant(p);
          router.push("/wallbox-sales-academy/training");
        }}
      />
    </div>
  );
}
