"use client";

import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useIsManager } from "@/components/providers/current-user";

export default function NewAnnouncementPage() {
  const isManager = useIsManager();

  if (!isManager) return <ForbiddenScreen />;

  return <AnnouncementComposer editing={null} />;
}
