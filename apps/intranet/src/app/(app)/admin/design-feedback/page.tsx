"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Frown, Meh, MessageSquareHeart, Smile } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonLink } from "@/components/profile/PersonLink";
import { useIsManager } from "@/components/providers/current-user";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sentiment = "positive" | "neutral" | "negative";

const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];

const SENTIMENT_VISUAL = {
  positive: { icon: Smile, className: "text-ok", labelKey: "sentimentPositive" },
  neutral: { icon: Meh, className: "text-warn", labelKey: "sentimentNeutral" },
  negative: { icon: Frown, className: "text-destructive", labelKey: "sentimentNegative" },
} as const;

export default function DesignFeedbackPage() {
  const t = useTranslations("Design");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const isManager = useIsManager();
  const feedback = useQuery(api.designFeedback.list, isManager ? {} : "skip");
  const [tab, setTab] = useState<"all" | Sentiment>("all");

  const rows = useMemo(
    () => (feedback ?? []).filter((row) => tab === "all" || row.sentiment === tab),
    [feedback, tab],
  );

  if (!isManager) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeaderBar
        title={t("adminTitle")}
        description={t("adminDescription")}
        icon={<MessageSquareHeart />}
      />

      <CountTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: tc("all"), count: feedback?.length },
          ...SENTIMENTS.map((sentiment) => ({
            value: sentiment,
            label: t(SENTIMENT_VISUAL[sentiment].labelKey),
            count: (feedback ?? []).filter((row) => row.sentiment === sentiment).length,
          })),
        ]}
      />

      <div className="pt-4">
        {feedback === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<MessageSquareHeart />}
            title={feedback.length === 0 ? t("empty") : t("noResults")}
          />
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {rows.map((row) => {
              const visual = SENTIMENT_VISUAL[row.sentiment];
              const Icon = visual.icon;
              return (
                <li key={row._id} className="flex gap-3 px-4 py-3.5">
                  <Icon
                    aria-label={t(visual.labelKey)}
                    className={cn("mt-0.5 size-5 shrink-0", visual.className)}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p
                      className={cn(
                        "whitespace-pre-wrap break-words text-sm",
                        !row.message && "italic text-muted-foreground",
                      )}
                    >
                      {row.message || t("noMessage")}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      <PersonLink userId={row.userId}>{row.userName}</PersonLink>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{row.path}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDateTime(row.createdAt, locale)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
