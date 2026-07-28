"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { AccessRequestsPanel } from "@/app/(app)/admin/AccessRequestsPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";

export default function AdminRequestsPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  if (!isManager) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("accessRequests")} icon={<Clock />} />
      <AccessRequestsPanel isAdmin={isAdmin} />
    </div>
  );
}
