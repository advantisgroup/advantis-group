"use client";

import { type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  Compass,
  ExternalLink,
  MessagesSquare,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Mark } from "@/components/branding/ProviderMark";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { SidePanel, SidePanelSection } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { formatDateTime } from "@/lib/format";

import { AiMarkdown } from "./AiMarkdown";
import { AI_STATE_ACCENT, aiErrorKey } from "./AiRunCard";
import { AiRunFeedback } from "./AiRunFeedback";
import { AiRunStats, AiThinking } from "./AiThinking";
import { useAiRunText } from "./transcript";
import { aiRunState, type AiRunMeta } from "./use-ai-run";

/** Where the wayfinder took someone, from its stored `{ href, label }`.
 * Null when the output isn't one of those. */
export function AiDestination({ output }: { output: string }) {
  const t = useTranslations("Ai");
  let destination: { href: string | null; label: string | null };
  try {
    destination = JSON.parse(output) as { href: string | null; label: string | null };
  } catch {
    return null;
  }
  if (!destination.href) {
    return (
      <p className="rounded-xl border border-border/70 px-3.5 py-3 text-[13px] text-muted-foreground">
        {t("history.result.nowhere")}
      </p>
    );
  }
  return (
    <Link
      href={destination.href}
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-colors hover:bg-accent/60"
    >
      <Compass className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">
          {t("history.result.tookYou", { label: destination.label ?? destination.href })}
        </span>
        <span className="block truncate font-mono text-[12px] text-muted-foreground">
          {destination.href}
        </span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function isJson(text: string) {
  try {
    const parsed: unknown = JSON.parse(text);
    return !!parsed && typeof parsed === "object";
  } catch {
    return false;
  }
}

/**
 * A quick look at one run without leaving the page: what was asked, what came
 * back, where it happened — then what it was given, a way to the whole
 * conversation, and the plain facts about the run.
 *
 * The point is that an answer can be checked rather than taken on trust —
 * which also means saying "not recorded" where nothing was, instead of
 * inventing a tidy-looking source list.
 */
export function AiRunDetail({
  run: opened,
  onOpenChange,
}: {
  run: AiRunMeta | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Ai");
  const tc = useTranslations("Common");
  const locale = useLocale();
  // Followed live, so a run opened while working turns into its answer here.
  const live = useQuery(api.aiRuns.get, opened ? { runId: opened._id } : "skip");
  const run = live ?? opened;
  const now = useNow(run?.status === "running");
  const text = useAiRunText(run?._id ?? null, run?.status);

  if (!run) return null;

  const state = aiRunState(run, now);
  const seconds = Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000));
  const accent = AI_STATE_ACCENT[state];
  const title = text.status === "ready" ? text.value.title : null;
  const output = text.status === "ready" ? text.value.output : null;
  const number = new Intl.NumberFormat(locale);

  const facts: { label: string; value: ReactNode }[] = [
    { label: t("detail.started"), value: formatDateTime(run.startedAt, locale) },
    { label: t("detail.duration"), value: t("elapsed", { seconds }) },
    {
      label: t("detail.model"),
      value: run.model ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Mark provider="claude" className="size-3.5 shrink-0" />
          <span className="truncate font-mono text-[12px]">{run.model}</span>
        </span>
      ) : (
        t("detail.notRecorded")
      ),
    },
    {
      label: t("detail.tokens"),
      value:
        run.tokensIn !== null || run.tokensOut !== null ? (
          // In and out as direction rather than as words — the arrows carry it
          // faster than "rein · raus" ever did.
          <span className="inline-flex items-center gap-2.5 tabular-nums">
            <span className="inline-flex items-center gap-0.5" title={t("detail.tokensIn")}>
              <ArrowDown className="size-3 text-muted-foreground" />
              {number.format(run.tokensIn ?? 0)}
              <span className="sr-only">{t("detail.tokensIn")}</span>
            </span>
            <span className="inline-flex items-center gap-0.5" title={t("detail.tokensOut")}>
              <ArrowUp className="size-3 text-muted-foreground" />
              {number.format(run.tokensOut ?? 0)}
              <span className="sr-only">{t("detail.tokensOut")}</span>
            </span>
          </span>
        ) : (
          t("detail.notRecorded")
        ),
    },
    {
      label: t("history.sent"),
      value:
        run.transcriptChars !== null
          ? t("chars", { count: run.transcriptChars })
          : state === "working"
            ? t("detail.sentPending")
            : t("detail.notRecorded"),
    },
  ];

  let answer: ReactNode;
  if (state === "working") {
    answer = (
      <div className="space-y-1.5">
        <AiThinking phase={run.phase} elapsedSec={seconds} />
        <p className="text-xs text-muted-foreground">{t("keepsRunning")}</p>
      </div>
    );
  } else if (state !== "done") {
    answer = (
      <p className="text-[13px] text-muted-foreground">
        {state === "error"
          ? t(aiErrorKey(run.errorCode))
          : state === "cancelled"
            ? t("cancelledBody")
            : t("interruptedBody")}
      </p>
    );
  } else if (text.status === "loading") {
    answer = <Skeleton className="h-20 rounded-xl" />;
  } else if (text.status === "error") {
    answer = <p className="text-[13px] text-destructive">{t("history.loadFailed")}</p>;
  } else if (!output) {
    answer = <p className="text-[13px] text-muted-foreground">{t("detail.noAnswer")}</p>;
  } else if (run.kind === "navigate") {
    answer = <AiDestination output={output} />;
  } else if (isJson(output)) {
    // Suggestions to review (fields, tags, a CV's contents) — they belong on
    // the page that applies them, not in a raw dump here.
    answer = <p className="text-[13px] text-muted-foreground">{t("detail.structured")}</p>;
  } else {
    answer = (
      <div className="text-sm leading-relaxed">
        <AiMarkdown>{output}</AiMarkdown>
      </div>
    );
  }

  return (
    <SidePanel
      open
      onOpenChange={onOpenChange}
      title={title ?? t(`kind.${run.kind}`)}
      accent={accent}
      closeLabel={tc("close")}
      header={
        <div className="space-y-1 pr-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="ai-text">{t(`kind.${run.kind}`)}</span>
            <span aria-hidden>·</span>
            <span className="size-1.5 rounded-full" style={{ background: accent }} />
            {t(`state.${state}`)}
          </span>
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-balance">
            {title ?? t(`kind.${run.kind}`)}
          </h2>
        </div>
      }
    >
      <SidePanelSection title={t("detail.answer")}>
        {answer}
        <AiRunStats run={run} className="mt-2" />
        {run.href && run.kind !== "navigate" && (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={run.href} onClick={() => onOpenChange(false)}>
              <ExternalLink />
              {t("detail.openWhere")}
            </Link>
          </Button>
        )}
      </SidePanelSection>

      <SidePanelSection title={t("detail.sources")}>
        {run.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("detail.sourcesEmpty")}</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {run.sources.map((source) => (
              <li key={`${source.label}-${source.href ?? ""}`} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                {source.href ? (
                  <Link href={source.href} className="min-w-0 hover:underline">
                    {source.label}
                  </Link>
                ) : (
                  <span className="min-w-0 text-muted-foreground">{source.label}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* The list names things the way a person would; the conversation is
            the exact text — so the way to it sits right under the list. */}
        <Link
          href={`/settings/ai/history/${run._id}`}
          onClick={() => onOpenChange(false)}
          className="mt-4 flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5 transition-colors hover:bg-accent"
        >
          <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">{t("detail.fullTranscript")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("detail.fullTranscriptHint")}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </SidePanelSection>

      {state !== "working" && (
        <SidePanelSection title={t("feedback.question")}>
          <AiRunFeedback runId={run._id} />
        </SidePanelSection>
      )}

      <SidePanelSection title={t("detail.aboutRun")}>
        <dl className="space-y-2 text-[13px]">
          {facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 text-right">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </SidePanelSection>
    </SidePanel>
  );
}
