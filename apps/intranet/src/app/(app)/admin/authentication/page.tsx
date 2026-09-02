"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { AuthenticationPolicyPanel } from "@/app/(app)/admin/AuthenticationPolicyPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";

export default function AdminAuthenticationPage() {
  const t = useTranslations("Admin");
  const isAdmin = useIsAdmin();

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeaderBar
        title={t("authenticationTitle")}
        description={t("authenticationSubtitle")}
        icon={<ShieldAlert />}
      />
      <AuthenticationPolicyPanel />
    </div>
  );
}
