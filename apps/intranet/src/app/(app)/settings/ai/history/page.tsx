"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { usePaginatedQuery } from "convex/react";
import { ArrowLeft, History } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiHistoryList } from "@/components/ai/AiHistoryList";
import { AI_FEATURES } from "@/components/ai/features";
import { type AiRunKind } from "@/components/ai/use-ai-run";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 25;

/**
 * Every AI run you started in the last 30 days — including the ones already
 * put away from the dock — each leading to what it was sent and what came back.
 */
export default function AiHistoryPage() {
  const t = useTranslations("Ai");
  const tc = useTranslations("Common");
  const [kinds, setKinds] = useState<AiRunKind[]>([]);
  // One feature filters on the server; more than one filters the loaded pages.
  const kind = kinds.length === 1 ? kinds[0] : undefined;
  const { results, status, loadMore } = usePaginatedQuery(
    api.aiRuns.history,
    { kind },
    { initialNumItems: PAGE_SIZE },
  );
  const runs = kinds.length > 1 ? results.filter((r) => kinds.includes(r.kind)) : results;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/settings/ai"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("history.back")}
        </Link>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {t("history.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
            {t("history.hint")}
          </p>
        </div>
        <FilterPill
          label={t("history.filterFeature")}
          options={AI_FEATURES.map((f) => ({ value: f.key, label: t(`kind.${f.key}`) }))}
          selected={kinds}
          onChange={(next) => setKinds(next as AiRunKind[])}
          clearLabel={tc("clear")}
        />
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" />}
          title={t("history.empty")}
          description={t("history.emptyHint")}
        />
      ) : (
        <AiHistoryList runs={runs} />
      )}

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => loadMore(PAGE_SIZE)}>
            {t("history.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
