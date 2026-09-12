"use client";

import { useParams } from "next/navigation";

import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useIsManager } from "@/components/providers/current-user";

export default function AnnouncementDraftPage() {
  const isManager = useIsManager();
  const { draftId } = useParams<{ draftId: string }>();

  if (!isManager) return <ForbiddenScreen />;

  return <AnnouncementComposer key={draftId} editing={null} draftId={draftId} />;
}
