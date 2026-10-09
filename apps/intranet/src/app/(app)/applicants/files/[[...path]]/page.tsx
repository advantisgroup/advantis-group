"use client";

import { useParams } from "next/navigation";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { useHasApplicantAccess } from "@/components/providers/current-user";
import { FileBrowser } from "@/components/onedrive/FileBrowser";
import { EmptyState } from "@/components/ui/empty-state";
import { HR_FOLDER_BASE } from "@/lib/onedrive-scopes";

/** Dedicated explorer for HR's OneDrive storage (Team/HR/…), reachable at
 * /hr/files via the `/hr → /applicants` rewrite. Gated by Applicant
 * Management access, mirroring the indirect write grant apps/api hands out
 * for this one subtree (see access.ts's `canWriteHR`). */
export default function HRFilesPage() {
  const t = useTranslations("Applicants");
  const hasAccess = useHasApplicantAccess();
  const params = useParams<{ path?: string[] }>();
  const sub = (params.path ?? []).map(decodeURIComponent).join("/");
  const initialPath = sub ? `${HR_FOLDER_BASE}/${sub}` : HR_FOLDER_BASE;

  if (!hasAccess) {
    return (
      <div className="p-6">
        <EmptyState icon={<Lock />} title={t("filesAccessDenied")} />
      </div>
    );
  }

  return (
    <FileBrowser
      initialPath={initialPath}
      rootPath={HR_FOLDER_BASE}
      rootLabel={t("filesRootLabel")}
      routeBase="/hr/files"
      title={t("filesRootLabel")}
      description={t("filesDescription")}
    />
  );
}
