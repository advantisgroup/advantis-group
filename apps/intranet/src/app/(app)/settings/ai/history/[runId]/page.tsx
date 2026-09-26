"use client";

import { type ReactNode } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ExternalLink, Search, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { AI_STATE_ACCENT, aiErrorKey } from "@/components/ai/AiRunCard";
import { AiVerbatim } from "@/components/ai/AiVerbatim";
import { AI_FEATURE_ICON, AI_RETENTION_MS } from "@/components/ai/features";
import { type AiTranscript, useAiRunText, useAiTranscript } from "@/components/ai/transcript";
import { aiRunState } from "@/components/ai/use-ai-run";
import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { formatDateTime } from "@/lib/format";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function prettyOutput(output: string): { json: string } | { text: string } {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === "object") return { json: JSON.stringify(parsed, null, 2) };
  } catch {
    // Prose — rendered as the answer was shown.
  }
  return { text: output };
}

function TranscriptView({ transcript }: { transcript: AiTranscript }) {
  const t = useTranslations("Ai");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const many = transcript.calls.length > 1;

  return (
    <div className="space-y-6">
      {transcript.truncated && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">
          {t("history.truncated")}
        </p>
      )}
      {transcript.lookups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[13.5px] font-medium">{t("history.lookups")}</h3>
          <ul className="space-y-2">
            {transcript.lookups.map((lookup, i) => (
              <li key={i} className="rounded-xl border border-border/70 bg-card p-3 text-[13px]">
                <p className="flex items-center gap-2 font-medium">
                  <Search className="size-3.5 text-muted-foreground" />
                  {lookup.label}: <span className="font-normal">„{lookup.query}“</span>
                </p>
                {lookup.results.length === 0 ? (
                  <p className="mt-1.5 text-muted-foreground">{t("history.lookupNothing")}</p>
                ) : (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {lookup.results.map((result, j) => (
                      <li key={j}>{result}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {transcript.calls.map((call, i) => (
        <div key={i} className="space-y-3">
          {many && (
            <h3 className="text-[13.5px] font-medium">
              {t("history.call", { n: i + 1, total: transcript.calls.length })}
            </h3>
          )}
          {call.system && (
            <details className="group rounded-xl border border-border/70 bg-card">
              <summary className="cursor-pointer select-none px-4 py-3 text-[13px] font-medium">
                {t("history.instructions")}
                <span className="ml-2 font-normal text-muted-foreground">
                  {t("chars", { count: call.system.length })}
                </span>
              </summary>
              <div className="px-4 pb-4">
                <AiVerbatim>{call.system}</AiVerbatim>
              </div>
            </details>
          )}
          {call.messages.map((message, j) => (
            <div key={j} className="space-y-1.5">
              <p className="text-[12px] font-medium text-muted-foreground">
                {t(`history.role.${message.role}`)} · {t("chars", { count: message.text.length })}
              </p>
              <AiVerbatim>{message.text}</AiVerbatim>
            </div>
          ))}
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-muted-foreground">
              {t("history.role.reply")}
              {call.reply !== null && (
                <>
                  {" "}
                  · {number.format(call.tokensIn)} → {number.format(call.tokensOut)}{" "}
                  {t("history.tokens")}
                </>
              )}
            </p>
            {call.reply === null ? (
              <p className="text-[13px] text-muted-foreground">{t("history.noReply")}</p>
            ) : (
              <AiVerbatim>{call.reply}</AiVerbatim>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * One run, in full: what it was, what it was given (the sources as a person
 * would name them, then the exact text the model received), what it looked
 * up, what came back, and when all of it is deleted.
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
      <div className="max-w-4xl space-y-4">
        {back}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (run === null) {
    return (
      <div className="max-w-4xl space-y-4">
        {back}
        <EmptyState title={t("history.notFound")} description={t("history.notFoundHint")} />
      </div>
    );
  }

  const state = aiRunState(run, now);
  const Icon = AI_FEATURE_ICON[run.kind];
  const title = text.status === "ready" ? text.value.title : null;
  const seconds = Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000));
  const number = new Intl.NumberFormat(locale);

  const facts: { label: string; value: ReactNode }[] = [
    {
      label: t("detail.status"),
      value: (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: AI_STATE_ACCENT[state] }} />
          {t(`state.${state}`)}
          {run.errorCode && (
            <span className="text-muted-foreground">· {t(aiErrorKey(run.errorCode))}</span>
          )}
        </span>
      ),
    },
    { label: t("detail.started"), value: formatDateTime(run.startedAt, locale) },
    { label: t("detail.duration"), value: t("elapsed", { seconds }) },
    {
      label: t("detail.model"),
      value: run.model ? (
        <span className="font-mono text-[12.5px]">{run.model}</span>
      ) : (
        t("detail.notRecorded")
      ),
    },
    {
      label: t("detail.tokens"),
      value:
        run.tokensIn !== null || run.tokensOut !== null
          ? t("history.tokensInOut", {
              in: number.format(run.tokensIn ?? 0),
              out: number.format(run.tokensOut ?? 0),
            })
          : t("detail.notRecorded"),
    },
    {
      label: t("history.sent"),
      value:
        run.transcriptChars !== null
          ? t("chars", { count: run.transcriptChars })
          : t("detail.notRecorded"),
    },
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

  const output =
    text.status === "ready" && text.value.output ? prettyOutput(text.value.output) : null;

  return (
    <div className="max-w-4xl space-y-10">
      <header className="space-y-4">
        {back}
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/70 text-muted-foreground">
            <Icon className="size-5" />
          </span>
          <div className="min-w-[14rem] flex-1">
            <p className="text-[12px] font-medium text-muted-foreground">
              <span className="ai-text">{t("eyebrow")}</span> · {t(`kind.${run.kind}`)}
            </p>
            <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-balance">
              {title ?? t(`kind.${run.kind}`)}
            </h1>
          </div>
          <div className="flex shrink-0 gap-2">
            {run.href && (
              <Button asChild variant="outline" size="sm">
                <Link href={run.href}>
                  <ExternalLink />
                  {t("open")}
                </Link>
              </Button>
            )}
            {run.status !== "running" && (
              <Button variant="outline" size="sm" onClick={() => void onDelete()}>
                <Trash2 />
                {tc("delete")}
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-y-4 border-y border-border/60 py-4 sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0 pr-3">
              <dt className="text-[12px] text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 break-words text-[13.5px]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Section title={t("detail.sources")} hint={t("history.sourcesHint")}>
        {run.sources.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("detail.sourcesEmpty")}</p>
        ) : (
          <ul className="space-y-1.5 text-[13.5px]">
            {run.sources.map((source) => (
              <li key={`${source.label}-${source.href ?? ""}`} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
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
      </Section>

      <Section title={t("history.transcriptTitle")} hint={t("history.transcriptHint")}>
        {run.status === "running" ? (
          <p className="text-[13px] text-muted-foreground">{t("history.transcriptPending")}</p>
        ) : transcript.status === "loading" ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : transcript.status === "error" ? (
          <p className="text-[13px] text-destructive">{t("history.loadFailed")}</p>
        ) : transcript.value === null ? (
          <p className="text-[13px] text-muted-foreground">{t("history.transcriptMissing")}</p>
        ) : (
          <TranscriptView transcript={transcript.value} />
        )}
      </Section>

      <Section title={t("history.answerTitle")}>
        {text.status === "loading" ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : text.status === "error" ? (
          <p className="text-[13px] text-destructive">{t("history.loadFailed")}</p>
        ) : !output ? (
          <p className="text-[13px] text-muted-foreground">{t("history.noAnswer")}</p>
        ) : "json" in output ? (
          <AiVerbatim>{output.json}</AiVerbatim>
        ) : (
          <div className="rounded-xl border border-border/70 bg-card p-4 text-[13.5px] leading-relaxed">
            <AiMarkdown>{output.text}</AiMarkdown>
          </div>
        )}
      </Section>
    </div>
  );
}
