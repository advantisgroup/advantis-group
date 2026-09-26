"use client";

import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useNow } from "@/hooks/use-now";
import { formatDateTime } from "@/lib/format";

import { AI_STATE_ACCENT } from "./AiRunCard";
import { AI_FEATURE_ICON } from "./features";
import { useAiRunTitles } from "./transcript";
import { type AiRunMeta, aiRunState } from "./use-ai-run";

/**
 * Past runs as rows you can open: what it was, what it was about, when, and
 * how it ended. Each one leads to its own page with the full transcript.
 */
export function AiHistoryList({ runs }: { runs: AiRunMeta[] }) {
  const t = useTranslations("Ai");
  const locale = useLocale();
  const now = useNow(runs.some((r) => r.status === "running"));
  const titleOf = useAiRunTitles(runs.filter((r) => r.hasTitle).map((r) => r._id));

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
      {runs.map((run) => {
        const state = aiRunState(run, now);
        const Icon = AI_FEATURE_ICON[run.kind];
        const title = titleOf(run._id);
        return (
          <li key={run._id}>
            <Link
              href={`/settings/ai/history/${run._id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 sm:px-5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">
                  {title ?? t(`kind.${run.kind}`)}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                  {title && <span>{t(`kind.${run.kind}`)}</span>}
                  <span>{formatDateTime(run.startedAt, locale)}</span>
                  {run.sources.length > 0 && (
                    <span>{t("history.sourcesCount", { count: run.sources.length })}</span>
                  )}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground sm:inline-flex">
                <span
                  className="size-2 rounded-full"
                  style={{ background: AI_STATE_ACCENT[state] }}
                />
                {t(`state.${state}`)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
