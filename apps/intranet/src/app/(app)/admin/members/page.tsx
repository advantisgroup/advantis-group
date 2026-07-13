"use client";

import { Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { MembersPanel } from "@/app/(app)/admin/MembersPanel";
import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";

export default function AdminMembersPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={t("members")} icon={<Users />} />
      <MembersPanel isManager={isManager} />
    </div>
  );
}
