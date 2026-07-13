"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { GuestLoginsPanel } from "@/app/(app)/admin/GuestLoginsPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin } from "@/components/providers/current-user";

export default function AdminGuestsPage() {
  const t = useTranslations("Admin");
  const isAdmin = useIsAdmin();

  if (!isAdmin) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("guests")} icon={<KeyRound />} />
      <GuestLoginsPanel />
    </div>
  );
}
