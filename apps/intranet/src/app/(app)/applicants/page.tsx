"use client";

import { UserSearch } from "lucide-react";
import { useTranslations } from "next-intl";

import { ApplicantAccessPanel } from "@/components/applicants/ApplicantAccessPanel";
import { ApplicantListView } from "@/components/applicants/ApplicantListView";
import { SkillProfilePanel } from "@/components/applicants/SkillProfilePanel";
import { TerminCalendar } from "@/components/applicants/TerminCalendar";
import { UploadCvButton } from "@/components/applicants/UploadCvButton";
import { PageHeader } from "@/components/PageHeader";
import { useCanManageApplicantAccess } from "@/components/providers/current-user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ApplicantsPage() {
  const t = useTranslations("Applicants");
  const canManageAccess = useCanManageApplicantAccess();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        icon={<UserSearch />}
        action={<UploadCvButton />}
      />

      <Tabs defaultValue="termine">
        <TabsList className="grid grid-cols-2 sm:inline-flex">
          <TabsTrigger value="termine">{t("tabTermine")}</TabsTrigger>
          <TabsTrigger value="neu">{t("tabNeu")}</TabsTrigger>
          <TabsTrigger value="pool">{t("tabPool")}</TabsTrigger>
          <TabsTrigger value="profile">{t("tabProfile")}</TabsTrigger>
          {canManageAccess && (
            <TabsTrigger value="access">{t("tabAccess")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="termine">
          <TerminCalendar />
        </TabsContent>
        <TabsContent value="neu">
          <ApplicantListView mode="neu" />
        </TabsContent>
        <TabsContent value="pool">
          <ApplicantListView mode="pool" />
        </TabsContent>
        <TabsContent value="profile">
          <SkillProfilePanel />
        </TabsContent>
        {canManageAccess && (
          <TabsContent value="access">
            <ApplicantAccessPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
