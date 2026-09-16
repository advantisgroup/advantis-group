"use client";

import { type ReactNode } from "react";

import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { type AiRunMeta, type AiRunPhase } from "./use-ai-run";

/** The one waiting state for AI: a shimmering verb and a quiet clock. No mark
 * of its own — whatever it sits next to already carries one. */
export function AiThinking({
  phase,
  label,
  detail,
  elapsedSec,
  className,
}: {
  phase?: AiRunPhase;
  label?: string;
  detail?: ReactNode;
  elapsedSec?: number;
  className?: string;
}) {
  const t = useTranslations("Ai");
  return (
    <span role="status" className={cn("inline-flex min-w-0 items-center gap-2 text-sm", className)}>
      <span className="ai-shimmer truncate font-medium">
        {label ?? t(`phase.${phase ?? "reading"}`)}
      </span>
      {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
      {elapsedSec !== undefined && elapsedSec >= 1 && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
          {t("elapsed", { seconds: elapsedSec })}
        </span>
      )}
    </span>
  );
}

/** What the thinking line settles into once a run is done: how long it worked
 * and how many tokens it used, small enough to skim past. */
export function AiRunStats({ run, className }: { run: AiRunMeta; className?: string }) {
  const t = useTranslations("Ai");
  const locale = useLocale();
  if (run.status !== "done" || !run.finishedAt) return null;

  const seconds = Math.max(1, Math.round((run.finishedAt - run.startedAt) / 1000));
  const tokens = (run.tokensIn ?? 0) + (run.tokensOut ?? 0);
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <p
      title={run.model ?? undefined}
      className={cn("ai-rise text-[11px] tabular-nums text-muted-foreground/70", className)}
    >
      {t("workedFor", { seconds })}
      {tokens > 0 && ` · ${t("tokensUsed", { count: compact.format(tokens) })}`}
    </p>
  );
}
