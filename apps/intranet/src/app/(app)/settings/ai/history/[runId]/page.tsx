"use client";

import { type ReactNode } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { AI_STATE_ACCENT, aiErrorKey } from "@/components/ai/AiRunCard";
import { AiDestination } from "@/components/ai/AiRunDetail";
import { AiRunFeedback } from "@/components/ai/AiRunFeedback";
import { AiThinking } from "@/components/ai/AiThinking";
import { AiTranscriptView } from "@/components/ai/AiTranscriptView";
import { AiVerbatim } from "@/components/ai/AiVerbatim";
import { AI_FEATURE_ICON, AI_RETENTION_MS } from "@/components/ai/features";
import { type AiTranscript, useAiRunText, useAiTranscript } from "@/components/ai/transcript";
import { type AiRunMeta, type AiRunState, aiRunState } from "@/components/ai/use-ai-run";
import { Mark } from "@/components/branding/ProviderMark";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { formatDateTime } from "@/lib/format";

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function sameText(a: string, b: string) {
  const normal = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return text.trim();
    }
  };
  return normal(a) === normal(b);
}

/** The last thing the model wrote, to tell whether the stored answer adds anything. */
function lastReplyText(transcript: AiTranscript | null) {
  const reply = transcript?.turns.findLast((turn) => turn.type === "reply");
  if (!reply || reply.type !== "reply") return null;
  return reply.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** How the conversation ends: where the wayfinder led, what the intranet kept
 * of the answer when that differs from the reply, or why it stopped. */
function Ending({
  run,
  state,
  output,
  transcript,
}: {
  run: AiRunMeta;
  state: AiRunState;
  output: string | null;
  transcript: AiTranscript | null;
}) {
  const t = useTranslations("Ai");

  if (state === "error" || state === "interrupted" || state === "cancelled") {
    return (
      <p className="flex items-start gap-2.5 rounded-xl border border-border/70 px-3 py-2.5 text-[13px]">
        <AlertTriangle
          className="mt-0.5 size-3.5 shrink-0"
          style={{ color: AI_STATE_ACCENT[state] }}
        />
        <span>
          <span className="font-medium">{t(`state.${state}`)}</span>
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            {state === "error"
              ? t(aiErrorKey(run.errorCode))
              : state === "cancelled"
                ? t("cancelledBody")
                : t("interruptedBody")}
          </span>
        </span>
      </p>
    );
  }
  if (!output) return null;

  if (run.kind === "navigate") return <AiDestination output={output} />;

  const reply = lastReplyText(transcript);
  if (reply !== null && sameText(reply, output)) return null;
  let json: string | null = null;
  try {
    json = JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    // Prose.
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t("history.result.kept")}</p>
      {json ? (
        <AiVerbatim className="p-3">{json}</AiVerbatim>
      ) : (
        <div className="rounded-xl border border-border/70 bg-card p-4 text-[14px] leading-relaxed">
          <AiMarkdown>{output}</AiMarkdown>
        </div>
      )}
    </div>
  );
}

/**
 * One run, read like the conversation it was: what was sent, what the model
 * looked up, what it answered and where that led — with the facts about the
 * run and your rating alongside instead of stacked above it.
 */
export default function AiRunPage() {
  const t = useTranslations("Ai");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const { runId } = useParams<{ runId: string }>();
  const id = runId as Id<"aiRuns">;
  const run = useQuery(api.aiRuns.get, { runId: id });
  const remove = useMutation(api.aiRuns.remove);
  const now = useNow(run?.status === "running");
  const text = useAiRunText(run ? id : null, run?.status);
  const transcript = useAiTranscript(run ? id : null, run ? run.status !== "running" : false);

  const back = (
    <Link
      href="/settings/ai/history"
      className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {t("history.backToList")}
    </Link>
  );

  if (run === undefined) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 max-w-3xl rounded-2xl" />
      </div>
    );
  }
  if (run === null) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState title={t("history.notFound")} description={t("history.notFoundHint")} />
      </div>
    );
  }

  const state = aiRunState(run, now);
  const Icon = AI_FEATURE_ICON[run.kind];
  const title = text.status === "ready" ? text.value.title : null;
  const output = text.status === "ready" ? text.value.output : null;
  const seconds = Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000));
  const number = new Intl.NumberFormat(locale);

  const facts: { label: string; value: ReactNode }[] = [
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
          <span className="inline-flex items-center gap-2.5 tabular-nums">
            <span className="inline-flex items-center gap-0.5" title={t("detail.tokensIn")}>
              <ArrowDown className="size-3 text-muted-foreground" />
              {number.format(run.tokensIn ?? 0)}
            </span>
            <span className="inline-flex items-center gap-0.5" title={t("detail.tokensOut")}>
              <ArrowUp className="size-3 text-muted-foreground" />
              {number.format(run.tokensOut ?? 0)}
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
          : t("detail.notRecorded"),
    },
    { label: t("detail.duration"), value: t("elapsed", { seconds }) },
    {
      label: t("history.deletedOn"),
      value: new Date(run.startedAt + AI_RETENTION_MS).toLocaleDateString(locale, {
        dateStyle: "medium",
      }),
    },
  ];

  async function onDelete() {
    const ok = await confirm({
      title: t("history.deleteConfirm"),
      description: t("history.deleteHint"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    await remove({ runId: id });
    toast.success(t("history.deleted"));
    router.push("/settings/ai/history");
  }

  return (
    <div className="space-y-7">
      <header className="space-y-3">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 max-w-3xl flex-1">
            {text.status === "loading" ? (
              <Skeleton className="h-7 w-80 max-w-full" />
            ) : (
              <h1 className="text-xl font-semibold tracking-tight text-balance">
                {title ?? t(`kind.${run.kind}`)}
              </h1>
            )}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {t(`kind.${run.kind}`)}
              </span>
              <span aria-hidden>·</span>
              <span>{formatDateTime(run.startedAt, locale)}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: AI_STATE_ACCENT[state] }}
                />
                {t(`state.${state}`)}
              </span>
            </p>
          </div>
          {run.href && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={run.href}>
                <ExternalLink />
                {t("open")}
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <main className="min-w-0 max-w-3xl">
          {run.status === "running" ? (
            <AiThinking
              phase={run.phase}
              label={t("history.transcriptPending")}
              elapsedSec={seconds}
            />
          ) : transcript.status === "loading" ? (
            <div className="space-y-4">
              <Skeleton className="h-9 rounded-xl" />
              <Skeleton className="ml-auto h-16 w-2/3 rounded-2xl" />
              <Skeleton className="h-24 w-5/6 rounded-xl" />
            </div>
          ) : transcript.status === "error" ? (
            <p className="text-[13px] text-destructive">{t("history.loadFailed")}</p>
          ) : transcript.value === null ? (
            <p className="text-[13px] text-muted-foreground">{t("history.transcriptMissing")}</p>
          ) : (
            <AiTranscriptView
              transcript={transcript.value}
              ending={
                <Ending run={run} state={state} output={output} transcript={transcript.value} />
              }
            />
          )}
        </main>

        <aside className="space-y-7 lg:sticky lg:top-6 lg:self-start">
          <RailSection title={t("detail.aboutRun")}>
            <dl className="space-y-2 text-[13px]">
              {facts.map((fact) => (
                <div key={fact.label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
                  <dd className="min-w-0 text-right">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </RailSection>

          <RailSection title={t("detail.sources")}>
            {run.sources.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("detail.sourcesEmpty")}</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {run.sources.map((source) => (
                  <li key={`${source.label}-${source.href ?? ""}`} className="flex gap-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
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
          </RailSection>

          {state !== "working" && (
            <RailSection title={t("feedback.question")}>
              <AiRunFeedback runId={id} />
            </RailSection>
          )}

          {run.status !== "running" && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 />
              {t("history.delete")}
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
