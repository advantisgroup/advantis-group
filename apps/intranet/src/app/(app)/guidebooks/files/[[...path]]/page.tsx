"use client";

import { useParams } from "next/navigation";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { useHasCapability } from "@/components/providers/current-user";
import { FileBrowser } from "@/components/onedrive/FileBrowser";
import { EmptyState } from "@/components/ui/empty-state";
import { WIKI_FOLDER_BASE } from "@/lib/onedrive-scopes";

/** Dedicated explorer for the wiki's OneDrive storage (Team/Wiki/…) —
 * gated by `manage_guidebooks` rather than the general file-browser
 * capability, mirroring the indirect write grant apps/api hands out for
 * this one subtree (see access.ts's `canWriteWiki`). */
export default function WikiFilesPage() {
  const t = useTranslations("Guidebooks");
  const canManage = useHasCapability("manage_guidebooks");
  const params = useParams<{ path?: string[] }>();
  const sub = (params.path ?? []).map(decodeURIComponent).join("/");
  const initialPath = sub ? `${WIKI_FOLDER_BASE}/${sub}` : WIKI_FOLDER_BASE;

  if (!canManage) {
    return (
      <div className="p-6">
        <EmptyState icon={<Lock />} title={t("filesAccessDenied")} />
      </div>
    );
  }

  return (
    <FileBrowser
      initialPath={initialPath}
      rootPath={WIKI_FOLDER_BASE}
      rootLabel={t("filesRootLabel")}
      routeBase="/guidebooks/files"
    />
  );
}
