"use client";

import { useParams } from "next/navigation";

import { ParticipantsTab } from "@/components/guidebooks/wallbox-academy/TrainerView";

export default function AdminParticipantDetailPage() {
  const params = useParams<{ participantId: string }>();
  return <ParticipantsTab focusParticipantId={params.participantId} />;
}
