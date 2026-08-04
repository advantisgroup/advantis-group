"use client";

import { Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { MembersPanel } from "@/app/(app)/admin/MembersPanel";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsManager } from "@/components/providers/current-user";

export default function AdminMembersPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeaderBar title={t("members")} icon={<Users />} />
      <MembersPanel isManager={isManager} />
    </div>
  );
}
