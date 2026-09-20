"use client";

import { useParams } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { ParticipantDetailPage } from "@/components/guidebooks/wallbox-academy/TrainerView";

export default function AdminParticipantPage() {
  const params = useParams<{ participantId: string }>();
  return (
    <ParticipantDetailPage participantId={params.participantId as Id<"academyParticipants">} />
  );
}
