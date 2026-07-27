"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { InvitesPanel } from "@/app/(app)/admin/InvitesPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useCurrentUser, useIsManager } from "@/components/providers/current-user";

export default function AdminInvitesPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const isAdmin = useCurrentUser().role === "admin";

  if (!isManager) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("invites")} icon={<Mail />} />
      <InvitesPanel isAdmin={isAdmin} />
    </div>
  );
}
