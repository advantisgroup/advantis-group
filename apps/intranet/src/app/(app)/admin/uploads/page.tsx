"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { OneDriveAuditPanel } from "@/components/onedrive/OneDriveAuditPanel";
import { TeamAccessPanel } from "@/components/onedrive/TeamAccessPanel";
import { UploadApprovalQueue } from "@/components/onedrive/UploadApprovalQueue";
import { PageHeader } from "@/components/PageHeader";
import { useHasCapability, useIsManager } from "@/components/providers/current-user";

export default function AdminUploadsPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const hasUploadsView = useHasCapability("manage_uploads");

  if (!isManager && !hasUploadsView) {
    return <ForbiddenScreen />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8" data-tour="tour-admin-uploads">
      <PageHeader title={t("uploads")} icon={<Upload />} />
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t("pendingUploads")}</h3>
        <UploadApprovalQueue readOnly={!isManager} />
      </div>
      {isManager && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t("teamAccessTitle")}</h3>
          <TeamAccessPanel />
        </div>
      )}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t("oneDriveActivity")}</h3>
        <OneDriveAuditPanel />
      </div>
    </div>
  );
}
