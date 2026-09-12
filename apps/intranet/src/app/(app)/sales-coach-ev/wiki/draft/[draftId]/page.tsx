"use client";

import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";

import { useIsAdmin } from "@/components/providers/current-user";
import { WikiArticleEditor } from "@/components/sales-coach-ev/WikiArticleEditor";

export default function SalesCoachWikiDraftPage() {
  const t = useTranslations("SalesCoachEv");
  const isAdmin = useIsAdmin();
  const { draftId } = useParams<{ draftId: string }>();

  if (!isAdmin) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {t("adminNotAuthorized")}
      </p>
    );
  }
  return <WikiArticleEditor key={draftId} article={{ draftId }} />;
}
