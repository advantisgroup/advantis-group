"use client";

import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { SidePanel, SidePanelProperties, SidePanelSection } from "@/components/ui/side-panel";
import { useNow } from "@/hooks/use-now";
import { formatDateTime } from "@/lib/format";

import { AI_STATE_ACCENT, aiErrorKey } from "./AiRunCard";
import { aiRunState, type AiRunMeta } from "./use-ai-run";

/**
 * Everything the app knows about one run, in plain rows: what answered it,
 * how long it took, how much it read and wrote, and what it was given.
 *
 * The point is that an answer can be checked rather than taken on trust —
 * which also means saying "not recorded" where nothing was, instead of
 * inventing a tidy-looking source list.
 */
export function AiRunDetail({
  run,
  onOpenChange,
}: {
  run: AiRunMeta | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Ai");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const now = useNow(run?.status === "running");

  if (!run) return null;

  const state = aiRunState(run, now);
  const seconds = Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000));
  const accent = AI_STATE_ACCENT[state];

  const rows = [
    {
      label: t("detail.status"),
      value: (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: accent }} />
          {t(`state.${state}`)}
        </span>
      ),
    },
    { label: t("detail.started"), value: formatDateTime(run.startedAt, locale) },
    { label: t("detail.duration"), value: t("elapsed", { seconds }) },
    { label: t("detail.model"), value: run.model ?? t("detail.notRecorded") },
    {
      label: t("detail.tokens"),
      value:
        run.tokensIn !== null || run.tokensOut !== null
          ? t("detail.tokensValue", { in: run.tokensIn ?? 0, out: run.tokensOut ?? 0 })
          : t("detail.notRecorded"),
    },
    { label: t("detail.output"), value: t("chars", { count: run.outputChars }) },
    ...(run.errorCode
      ? [
          {
            label: t("detail.errorCode"),
            value: (
              <span>
                <span className="font-mono text-xs">{run.errorCode}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {t(aiErrorKey(run.errorCode))}
                </span>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <SidePanel
      open
      onOpenChange={onOpenChange}
      title={t(`kind.${run.kind}`)}
      accent={accent}
      closeLabel={tc("close")}
      header={
        <div className="space-y-1 pr-8">
          <span className="text-xs font-medium text-muted-foreground">
            <span className="ai-text">{t("eyebrow")}</span> · {t("detail.title")}
          </span>
          <h2 className="text-lg font-semibold leading-snug tracking-tight">
            {t(`kind.${run.kind}`)}
          </h2>
        </div>
      }
    >
      <SidePanelSection title={t("detail.aboutRun")}>
        <SidePanelProperties rows={rows} />
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
      </SidePanelSection>

      {run.href && (
        <SidePanelSection title={t("detail.result")}>
          <Link
            href={run.href}
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {t("open")}
            <ExternalLink className="size-3.5" />
          </Link>
        </SidePanelSection>
      )}
    </SidePanel>
  );
}
