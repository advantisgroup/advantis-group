"use client";

import { NewDraftRedirect } from "@/components/compose/NewDraftRedirect";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useIsManager } from "@/components/providers/current-user";

export default function NewAnnouncementPage() {
  const isManager = useIsManager();

  if (!isManager) return <ForbiddenScreen />;

  return <NewDraftRedirect surface="announcement" to={(id) => `/announcements/draft/${id}`} />;
}
