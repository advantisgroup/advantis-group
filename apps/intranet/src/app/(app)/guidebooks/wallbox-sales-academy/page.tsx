"use client";

import { useRouter } from "next/navigation";

import { Home } from "@/components/guidebooks/wallbox-academy/Home";
import { useAcademySession } from "@/components/guidebooks/wallbox-academy/session";

export default function WallboxAcademyHomePage() {
  const router = useRouter();
  const { loginParticipant, loginAdmin } = useAcademySession();

  return (
    <Home
      onParticipantLogin={p => {
        loginParticipant(p);
        router.push("/guidebooks/wallbox-sales-academy/training");
      }}
      onAdminLogin={() => {
        loginAdmin();
        router.push("/guidebooks/wallbox-sales-academy/admin/teilnehmer");
      }}
    />
  );
}
