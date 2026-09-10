"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { ArrowLeft, Target } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiButton } from "@/components/ai/AiButton";
import { AiRunCard } from "@/components/ai/AiRunCard";
import { parseJson, useAiRun } from "@/components/ai/use-ai-run";
import { Link } from "@/components/Link";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";
import {
  type EodSummary,
  startEodSummary,
  useSalesCoachCalls,
} from "@/lib/sales-coach-ev-api";

const MILESTONE = 30;

function Ring({ value, label }: { value: number; label: string }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative size-[90px]">
        <svg viewBox="0 0 90 90" className="size-full -rotate-90">
          <circle cx={45} cy={45} r={r} fill="none" stroke="var(--border)" strokeWidth={7} />
          <circle
            cx={45}
            cy={45}
            r={r}
            fill="none"
            stroke="var(--chart-active)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - (value / 100) * circ}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-mono text-xl font-extrabold">
          {value}
        </div>
      </div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function RankedList({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li
            key={index}
            className="ai-rise flex items-start gap-2.5 text-sm leading-relaxed"
            style={{ ["--i" as string]: index }}
          >
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
              style={{ color: accent, background: `color-mix(in oklch, ${accent} 14%, transparent)` }}
            >
              {index + 1}
            </span>
            {item}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The end-of-training review as its own page. The summary is keyed by day
 * and call count, so reopening it the same day shows the one already written
 * instead of paying for another — "write again" is there when that's wanted.
 */
export function DailySummaryView() {
  const t = useTranslations("SalesCoachEv");
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const { calls } = useSalesCoachCalls("all");

  const scored = useMemo(
    () =>
      (calls ?? [])
        .filter((c) => c.scored && c.skillLevel !== null)
        .sort((a, b) => a.startedAt - b.startedAt),
    [calls],
  );
  const ready = scored.length >= MILESTONE;
  const key = `${new Date().toISOString().slice(0, 10)}-${scored.length}`;
  const view = useAiRun<EodSummary>(
    { subjectKey: calls && ready ? `coachEod:${key}` : null },
    parseJson,
  );
  const startedFor = useRef<string | null>(null);

  const start = useCallback(async () => {
    startedFor.current = key;
    const recent = scored.slice(-MILESTONE);
    try {
      await startEodSummary(apiClient, {
        strengths: recent.flatMap((c) => c.feedback?.strengths ?? []).slice(0, 15),
        improvements: recent.flatMap((c) => c.feedback?.improvements ?? []).slice(0, 15),
        key,
      });
    } catch (e) {
      handleError(e, t("eodSummaryFailed"));
    }
  }, [apiClient, handleError, key, scored, t]);

  // Opening this page is asking for the review — once per set of calls.
  useEffect(() => {
    if (ready && !view.loading && !view.run && startedFor.current !== key) void start();
  }, [ready, view.loading, view.run, key, start]);

  useEffect(() => {
    if (view.state === "done") view.markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state]);

  const today = new Date().toDateString();
  const todayCalls = scored.filter((c) => new Date(c.startedAt).toDateString() === today);
  const average = (rows: typeof scored) =>
    rows.length ? Math.round(rows.reduce((sum, c) => sum + (c.skillLevel ?? 0), 0) / rows.length) : 0;

  const back = (
    <Link
      href="/sales-coach-ev/progress"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t("backToProgress")}
    </Link>
  );

  if (!calls) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!ready) {
    const filled = Math.round((scored.length / MILESTONE) * 100);
    return (
      <div className="space-y-4">
        {back}
        <section
          className="rounded-2xl border border-border/60 p-5"
          style={{
            backgroundColor: "var(--card)",
            backgroundImage:
              "radial-gradient(30rem 12rem at 0% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 70%)",
          }}
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-primary">
                {t("eodTitle")}
              </p>
              <h2 className="mt-0.5 font-display text-xl font-bold tracking-tight">
                {t("eodMilestoneRemaining", { count: MILESTONE - scored.length })}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("summaryMilestoneBody", { total: MILESTONE })}
              </p>
            </div>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {scored.length}/{MILESTONE}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${filled}%` }} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {back}
      <section className="flex flex-wrap items-center justify-center gap-8 rounded-2xl border border-border/60 bg-card p-5 sm:justify-start">
        <Ring value={average(scored)} label={t("eodTotal")} />
        {todayCalls.length > 0 && <Ring value={average(todayCalls)} label={t("eodToday")} />}
        <div className="space-y-1 text-sm text-foreground/80">
          <div>
            {t("eodCallsTotal")}: <strong>{scored.length}</strong>
          </div>
          <div>
            {t("eodCallsToday")}: <strong>{todayCalls.length}</strong>
          </div>
          <div>
            {t("eodAppointmentsToday")}:{" "}
            <strong>{todayCalls.filter((c) => c.outcome === "termin").length}</strong>
          </div>
        </div>
      </section>

      {view.state === "done" && view.result ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight">
              {t("summaryReadyTitle")}
            </h2>
            <AiButton onClick={() => void start()}>{t("summaryRegenerate")}</AiButton>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <RankedList
              title={t("eodTop3Strengths")}
              items={view.result.top3strengths}
              accent="var(--success)"
            />
            <RankedList
              title={t("eodTop3Improvements")}
              items={view.result.top3improvements}
              accent="var(--warning)"
            />
          </div>
        </>
      ) : (
        view.run && (
          <AiRunCard
            view={view}
            titles={{ working: t("summaryWorkingTitle", { count: MILESTONE }) }}
            onRetry={() => void start()}
          />
        )
      )}
    </div>
  );
}
