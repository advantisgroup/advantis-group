"use client";

import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useNow } from "@/hooks/use-now";
import { formatTime } from "@/lib/format";

import { AI_STATE_ACCENT } from "./AiRunCard";
import { AI_FEATURE_ICON } from "./features";
import { useAiRunTitles } from "./transcript";
import { type AiRunMeta, aiRunState } from "./use-ai-run";

const DAY_MS = 86_400_000;

function startOfDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Past runs by day, newest first: when, what it was about, which feature —
 * and how it ended only when it didn't simply finish. Each row opens the run's
 * whole conversation.
 */
export function AiHistoryList({ runs }: { runs: AiRunMeta[] }) {
  const t = useTranslations("Ai");
  const locale = useLocale();
  const now = useNow(runs.some((r) => r.status === "running"));
  const titleOf = useAiRunTitles(runs.filter((r) => r.hasTitle).map((r) => r._id));
  const today = startOfDay(now);

  const days: { day: number; runs: AiRunMeta[] }[] = [];
  for (const run of runs) {
    const day = startOfDay(run.startedAt);
    const last = days.at(-1);
    if (last?.day === day) last.runs.push(run);
    else days.push({ day, runs: [run] });
  }

  const dayLabel = (day: number) =>
    day === today
      ? t("history.today")
      : day === startOfDay(today - DAY_MS / 2)
        ? t("history.yesterday")
        : new Date(day).toLocaleDateString(locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
          });

  return (
    <div className="space-y-6">
      {days.map(({ day, runs: dayRuns }) => (
        <section key={day} className="space-y-1.5">
          <h3 className="px-1 text-xs font-medium text-muted-foreground">{dayLabel(day)}</h3>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {dayRuns.map((run) => {
              const state = aiRunState(run, now);
              const Icon = AI_FEATURE_ICON[run.kind];
              const title = titleOf(run._id);
              return (
                <li key={run._id}>
                  <Link
                    href={`/settings/ai/history/${run._id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
                  >
                    <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatTime(run.startedAt, locale)}
                    </span>
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">
                        {title ?? t(`kind.${run.kind}`)}
                      </span>
                      {title && (
                        <span className="block truncate text-xs text-muted-foreground sm:hidden">
                          {t(`kind.${run.kind}`)}
                        </span>
                      )}
                    </span>
                    {title && (
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {t(`kind.${run.kind}`)}
                      </span>
                    )}
                    {state !== "done" && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: AI_STATE_ACCENT[state] }}
                        />
                        <span className="max-sm:sr-only">{t(`state.${state}`)}</span>
                      </span>
                    )}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
