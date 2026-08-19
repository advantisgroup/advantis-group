"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { OnboardFlow } from "@/components/admin/onboard/OnboardFlow";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";

export default function AdminOnboardPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  if (!isManager) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <PageHeaderBar
        title={t("onboardPageTitle")}
        description={t("onboardPageDescription")}
        icon={<UserPlus />}
      />
      <OnboardFlow isAdmin={isAdmin} />
    </div>
  );
}
