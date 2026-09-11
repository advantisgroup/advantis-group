"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { InvitesPanel } from "@/app/(app)/admin/InvitesPanel";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { DesignSwitch } from "@/lib/design-preview";

export default function AdminInvitesPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  if (!isManager) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeaderBar title={t("invites")} icon={<Mail />} />
      <DesignSwitch
        refreshed={<InvitesPanel isAdmin={isAdmin} refreshed />}
        classic={<InvitesPanel isAdmin={isAdmin} />}
      />
    </div>
  );
}
