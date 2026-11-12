"use client";

import { useMemo } from "react";

import { useRouter } from "next/navigation";

import { UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { MembersPanel } from "@/app/(app)/admin/MembersPanel";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsManager } from "@/components/providers/current-user";

export default function AdminMembersPage() {
  const t = useTranslations("Admin");
  const router = useRouter();
  const isManager = useIsManager();

  const actions = useMemo(
    () => [
      {
        key: "new",
        label: t("overview.invite"),
        icon: UserPlus,
        onClick: () => router.push("/admin/onboard"),
      },
    ],
    [t, router],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeaderBar title={t("members")} icon={<Users />} />
      {isManager && <PageHeaderActions actions={actions} />}
      <MembersPanel isManager={isManager} />
    </div>
  );
}
