"use client";

import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";

import { useIsAdmin } from "@/components/providers/current-user";
import { WikiArticleEditor } from "@/components/sales-coach-ev/WikiArticleEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { useSalesCoachWiki } from "@/lib/sales-coach-ev-api";

export default function EditSalesCoachWikiArticlePage() {
  const t = useTranslations("SalesCoachEv");
  const { id } = useParams<{ id: string }>();
  const isAdmin = useIsAdmin();
  const { articles, status } = useSalesCoachWiki();

  const message = (text: string) => (
    <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );

  if (!isAdmin) return message(t("adminNotAuthorized"));
  if (!articles) {
    return status === "error" ? (
      message(t("wikiNotFound"))
    ) : (
      <Skeleton className="h-64 w-full rounded-2xl" />
    );
  }
  const article = articles.find((a) => a._id === id);
  if (!article) return message(t("wikiNotFound"));
  return <WikiArticleEditor key={article._id} article={article} />;
}
