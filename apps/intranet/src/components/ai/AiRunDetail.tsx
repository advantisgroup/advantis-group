"use client";

import { type ComponentType, type ReactNode, useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Coins,
  ExternalLink,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Type,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Mark } from "@/components/branding/ProviderMark";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { SidePanel, SidePanelSection } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { useNow } from "@/hooks/use-now";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AI_STATE_ACCENT, aiErrorKey } from "./AiRunCard";
import { aiRunState, type AiRunMeta } from "./use-ai-run";

/** Every run here is answered by a Claude model, so the model row wears its mark. */
function ClaudeMark({ className }: { className?: string }) {
  return <Mark provider="claude" className={className} />;
}

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
  const saved = useQuery(api.aiRuns.myFeedback, run ? { runId: run._id } : "skip");
  const rateRun = useMutation(api.aiRuns.rateRun);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setNote(saved?.note ?? "");
    setNoteSaved(false);
  }, [saved?.note, run?._id]);

  if (!run) return null;

  const state = aiRunState(run, now);
  const seconds = Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000));
  const accent = AI_STATE_ACCENT[state];

  const number = new Intl.NumberFormat(locale);
  const rows: {
    id: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: ReactNode;
  }[] = [
    {
      id: "status",
      icon: Activity,
      label: t("detail.status"),
      value: (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: accent }} />
          {t(`state.${state}`)}
        </span>
      ),
    },
    {
      id: "started",
      icon: CalendarClock,
      label: t("detail.started"),
      value: formatDateTime(run.startedAt, locale),
    },
    { id: "duration", icon: Timer, label: t("detail.duration"), value: t("elapsed", { seconds }) },
    {
      id: "model",
      icon: ClaudeMark,
      label: t("detail.model"),
      value: run.model ? (
        <span className="font-mono text-[12.5px]">{run.model}</span>
      ) : (
        t("detail.notRecorded")
      ),
    },
    {
      id: "tokens",
      icon: Coins,
      label: t("detail.tokens"),
      value:
        run.tokensIn !== null || run.tokensOut !== null ? (
          // In and out as direction rather than as words — the arrows carry it
          // faster than "rein · raus" ever did.
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1" title={t("detail.tokensIn")}>
              <ArrowDown className="size-3.5 text-muted-foreground" />
              <span className="tabular-nums">{number.format(run.tokensIn ?? 0)}</span>
              <span className="sr-only">{t("detail.tokensIn")}</span>
            </span>
            <span className="inline-flex items-center gap-1" title={t("detail.tokensOut")}>
              <ArrowUp className="size-3.5 text-muted-foreground" />
              <span className="tabular-nums">{number.format(run.tokensOut ?? 0)}</span>
              <span className="sr-only">{t("detail.tokensOut")}</span>
            </span>
          </span>
        ) : (
          t("detail.notRecorded")
        ),
    },
    {
      id: "output",
      icon: Type,
      label: t("detail.output"),
      value: t("chars", { count: run.outputChars }),
    },
    ...(run.errorCode
      ? [
          {
            id: "error",
            icon: AlertTriangle,
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
        {/* Icon-led rather than a plain label column: what each line is about
            reads before the words do, which is the point of a details panel. */}
        <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-[9px] text-[13px] sm:grid-cols-[9.5rem_minmax(0,1fr)]">
          {rows.map((row) => (
            <div key={row.id} className="contents">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <row.icon className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{row.label}</span>
              </dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
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

      {state !== "working" && (
        <SidePanelSection title={t("feedback.question")}>
          <div className="flex flex-wrap items-center gap-2">
            {(["up", "down"] as const).map((rating) => {
              const Icon = rating === "up" ? ThumbsUp : ThumbsDown;
              const active = saved?.rating === rating;
              return (
                <Button
                  key={rating}
                  variant="outline"
                  size="sm"
                  aria-pressed={active}
                  // Unmistakably picked: a tinted fill and a filled icon in the
                  // rating's own colour. The old two-percent wash on the border
                  // left people unsure the click had registered at all.
                  className={cn(
                    active &&
                      (rating === "up"
                        ? "border-success/40 bg-success/10 text-success hover:bg-success/15 hover:text-success"
                        : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"),
                  )}
                  onClick={() => void rateRun({ runId: run._id, rating, note: note || undefined })}
                >
                  <Icon className={cn(active && "fill-current")} />
                  {t(`feedback.${rating}`)}
                  {active && <Check className="size-3.5 opacity-80" />}
                </Button>
              );
            })}
          </div>
          {saved?.rating === "down" && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  setNoteSaved(false);
                }}
                placeholder={t("feedback.notePlaceholder")}
                className="min-h-[72px]"
              />
              <div className="flex items-center justify-end gap-2">
                {noteSaved && (
                  <span className="text-xs text-muted-foreground">{t("feedback.saved")}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void rateRun({ runId: run._id, rating: "down", note }).then(() =>
                      setNoteSaved(true),
                    );
                  }}
                >
                  {t("feedback.save")}
                </Button>
              </div>
            </div>
          )}
        </SidePanelSection>
      )}

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
