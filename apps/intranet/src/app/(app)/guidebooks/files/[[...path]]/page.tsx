"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { BookOpen, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { useKnowledgeTabs } from "@/components/guidebooks/knowledge-tabs";
import { Link } from "@/components/Link";
import { useHasCapability } from "@/components/providers/current-user";
import { FileBrowser } from "@/components/onedrive/FileBrowser";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { EmptyState } from "@/components/ui/empty-state";
import { WIKI_FOLDER_BASE } from "@/lib/onedrive-scopes";

/** The wiki's OneDrive storage (Team/Wiki/…) as the knowledge base's second
 * tab rather than a button that navigates away from it — the files and the
 * entries are two indexes of the same material, so they belong to one
 * section. Gated by `manage_guidebooks` rather than the general file-browser
 * capability, mirroring the indirect write grant apps/api hands out for this
 * one subtree (see access.ts's `canWriteWiki`). */
export default function WikiFilesPage() {
  const t = useTranslations("Guidebooks");
  const canManage = useHasCapability("manage_guidebooks");
  const tabs = useKnowledgeTabs();
  const params = useParams<{ path?: string[] }>();
  const segments = (params.path ?? []).map(decodeURIComponent);
  const sub = segments.join("/");
  const initialPath = sub ? `${WIKI_FOLDER_BASE}/${sub}` : WIKI_FOLDER_BASE;
  // Every entry's attachments live under a folder named after its slug, so
  // the first path segment says which entry this folder belongs to. Without
  // the link back, the two tabs are two lists of the same material with no
  // way to get from one to the other.
  const entry = useQuery(
    api.wiki.entries.get,
    canManage && segments[0] ? { slug: segments[0] } : "skip",
  );

  if (!canManage) {
    return (
      <div className="p-6">
        <EmptyState icon={<Lock />} title={t("filesAccessDenied")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeaderBar title={t("title")} description={t("subtitle")} />
      <RouteTabs tabs={tabs} activeValue="files" />
      {entry && (
        <Link
          href={`/guidebooks/${entry.slug}`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <BookOpen className="size-4 shrink-0" />
          {t("filesBelongTo", { title: entry.thema })}
        </Link>
      )}
      <div className="mt-4">
        <FileBrowser
          initialPath={initialPath}
          rootPath={WIKI_FOLDER_BASE}
          rootLabel={t("filesRootLabel")}
          routeBase="/guidebooks/files"
        />
      </div>
    </div>
  );
}
