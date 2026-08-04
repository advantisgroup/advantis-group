"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { FileQuestion } from "lucide-react";
import { useTranslations } from "next-intl";

import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { isOwnerOrAdmin, useCurrentUser } from "@/components/providers/current-user";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditAnnouncementPage() {
  const t = useTranslations("Announcements");
  const params = useParams<{ id: string }>();
  const me = useCurrentUser();
  const announcements = useQuery(api.announcements.list, {});
  const editing = announcements?.find((a) => a._id === (params.id as Id<"announcements">)) ?? null;

  if (announcements === undefined) return null;

  if (!editing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <EmptyState icon={<FileQuestion />} title={t("notFound")} />
      </div>
    );
  }

  if (!isOwnerOrAdmin(me, editing.ownerId)) return <ForbiddenScreen />;

  return <AnnouncementComposer editing={editing} />;
}
