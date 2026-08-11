"use client";

import { Suspense } from "react";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { PasswordResetsPanel } from "@/app/(app)/admin/password-resets/PasswordResetsPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";

export default function AdminPasswordResetsPage() {
  const t = useTranslations("PasswordReset");
  const isAdmin = useIsAdmin();

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeaderBar title={t("adminTitle")} description={t("adminSubtitle")} icon={<KeyRound />} />
      <Suspense fallback={null}>
        <PasswordResetsPanel />
      </Suspense>
    </div>
  );
}
