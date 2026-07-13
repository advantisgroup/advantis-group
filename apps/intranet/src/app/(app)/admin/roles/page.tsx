"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { CustomRolesPanel } from "@/app/(app)/admin/CustomRolesPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";

export default function AdminRolesPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();

  if (!isManager) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("customRolesTab")} icon={<ShieldCheck />} />
      <CustomRolesPanel />
    </div>
  );
}
