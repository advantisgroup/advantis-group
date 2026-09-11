"use client";

import { useEffect } from "react";

import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { AiButton } from "@/components/ai/AiButton";
import { AiRunCard } from "@/components/ai/AiRunCard";
import { useAiRun } from "@/components/ai/use-ai-run";
import { Link } from "@/components/Link";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";
import { startCallReport, useSalesCoachCallRecord } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

import { SCORE_CATEGORIES, fmtDuration, outcomeLabel, scoreColorClass } from "./constants";
import { type CallRecord, type Feedback, type Scores } from "./types";

function scoreAccent(value: number): string {
  return value >= 70 ? "var(--success)" : value >= 45 ? "var(--warning)" : "var(--destructive)";
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        ok ? "bg-foreground/[0.07]" : "border border-dashed border-warning/60",
      )}
    >
      {ok ? (
        <Check className="size-3 text-success" strokeWidth={3} />
      ) : (
        <AlertTriangle className="size-3 text-warning" />
      )}
      {label}
    </span>
  );
}

/** The verdict: one big number, one sentence, and a bar per category so the
 * shape of the call is visible before reading a word of feedback. */
function ReportHero({
  call,
  scores,
  feedback,
  skill,
}: {
  call: CallRecord;
  scores: Scores;
  feedback: Feedback;
  skill: number;
}) {
  const t = useTranslations("SalesCoachEv");
  const accent = scoreAccent(skill);
  const verdict =
    skill >= 70
      ? t("reportVerdictStrong")
      : skill >= 45
        ? t("reportVerdictSolid")
        : t("reportVerdictWeak");

  return (
    <section
      className="rounded-2xl border border-border/60 p-5"
      style={{
        backgroundColor: "var(--card)",
        backgroundImage: `radial-gradient(34rem 14rem at 0% 0%, color-mix(in oklch, ${accent} 16%, transparent), transparent 70%)`,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 flex-1">
          <p
            className="text-[0.7rem] font-medium uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            {t("reportTitle")} · {fmtDuration(call.durationSec)} · {outcomeLabel(call.outcome)}
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-balance">
            {verdict}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("reportScoreBody", { score: skill, count: SCORE_CATEGORIES.length })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip
              ok={feedback.missingInfos.length === 0}
              label={
                feedback.missingInfos.length === 0
                  ? t("reportAllInfo")
                  : t("reportMissingCount", { count: feedback.missingInfos.length })
              }
            />
            <Chip
              ok={feedback.weakFormulations.length === 0}
              label={
                feedback.weakFormulations.length === 0
                  ? t("weakFormulationsNone")
                  : t("reportWeakCount", { count: feedback.weakFormulations.length })
              }
            />
          </div>
        </div>
        <div className="flex items-end gap-5">
          <div className="flex items-end gap-1" aria-hidden>
            {SCORE_CATEGORIES.map((cat) => {
              const value = scores[cat.key];
              return (
                <span
                  key={cat.key}
                  title={`${cat.label}: ${value}`}
                  className="w-2 rounded-full"
                  style={{ height: `${10 + value * 0.42}px`, background: scoreAccent(value) }}
                />
              );
            })}
          </div>
          <div className="text-right">
            <div
              className="font-mono text-5xl font-extrabold leading-none tabular-nums"
              style={{ color: accent }}
            >
              {skill}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("skillScore")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ListCard({
  title,
  items,
  accent,
  empty,
}: {
  title: string;
  items: string[];
  accent: string;
  empty?: string;
}) {
  if (!items.length && !empty) return null;
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: accent }} />
        {title}
      </h3>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li
              key={index}
              className="ai-rise flex gap-2 text-sm leading-relaxed text-foreground/90"
              style={{ ["--i" as string]: index }}
            >
              <span
                className="mt-2 size-1 shrink-0 rounded-full opacity-60"
                style={{ background: accent }}
              />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <Check className="size-3.5" strokeWidth={3} />
          {empty}
        </p>
      )}
    </section>
  );
}

/**
 * One call's report, as a page: the verdict up top, the eight categories
 * with their comments on the left, and what to do about it on the right.
 * While the call is still being scored the run stands in for all of it,
 * and a call that was never scored can be scored from here.
 */
export function CallReportView({ callId }: { callId: string }) {
  const t = useTranslations("SalesCoachEv");
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();
  const callQuery = useSalesCoachCallRecord(callId);
  const call = callQuery.data;
  const view = useAiRun({ subjectKey: `coachReport:${callId}` });

  const runStatus = view.run?.status;
  const { refresh } = callQuery;
  useEffect(() => {
    if (runStatus === "done") refresh();
  }, [runStatus, refresh]);

  const scored = !!call?.scored;
  useEffect(() => {
    if (scored && view.state === "done") view.markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, view.state]);

  async function startReport() {
    if (!call) return;
    try {
      await startCallReport(apiClient, {
        callId,
        transcript: call.transcript,
        durationSec: call.durationSec,
        callerSpeakPct: call.callerSpeakPct,
        outcome: call.outcome,
      });
    } catch (e) {
      handleError(e, t("reportStartFailed"));
    }
  }

  const back = (
    <Link
      href="/sales-coach-ev/progress"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t("backToProgress")}
    </Link>
  );

  if (!call) {
    return (
      <div className="space-y-4">
        {back}
        {callQuery.status === "error" ? (
          <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("reportNotFound")}
          </p>
        ) : (
          <Skeleton className="h-40 w-full rounded-2xl" />
        )}
      </div>
    );
  }

  if (!call.scored || !call.scores || !call.feedback || call.skillLevel === null) {
    return (
      <div className="space-y-4">
        {back}
        {view.run ? (
          <AiRunCard
            view={view}
            titles={{ working: t("reportWaitingTitle") }}
            onRetry={() => void startReport()}
          />
        ) : (
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-border/80 p-5">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold tracking-tight">{t("reportTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {call.durationSec < 60
                  ? t("reportTooShort")
                  : `${fmtDuration(call.durationSec)} · ${outcomeLabel(call.outcome)}`}
              </p>
            </div>
            {call.durationSec >= 60 && (
              <AiButton onClick={() => void startReport()}>{t("reportStart")}</AiButton>
            )}
          </section>
        )}
      </div>
    );
  }

  const { scores, feedback, skillLevel } = call;

  return (
    <div className="space-y-4">
      {back}
      <ReportHero call={call} scores={scores} feedback={feedback} skill={skillLevel} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("skillBreakdown")}
          </h3>
          <div className="space-y-4">
            {SCORE_CATEGORIES.map((cat, index) => {
              const value = scores[cat.key];
              return (
                <div key={cat.key} className="ai-rise" style={{ ["--i" as string]: index }}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{cat.label}</span>
                    <span className={cn("font-mono text-sm font-bold", scoreColorClass(value))}>
                      {value}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${value}%`, background: scoreAccent(value) }}
                    />
                  </div>
                  {feedback.comments[cat.key] && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {feedback.comments[cat.key]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <div className="space-y-4">
          <ListCard title={t("nextSteps")} items={feedback.nextSteps} accent="var(--primary)" />
          <ListCard title={t("strengths")} items={feedback.strengths} accent="var(--success)" />
          <ListCard
            title={t("improvements")}
            items={feedback.improvements}
            accent="var(--warning)"
          />
          <ListCard
            title={t("missingInfos")}
            items={feedback.missingInfos}
            accent="var(--destructive)"
            empty={t("missingInfosNone")}
          />
          <ListCard
            title={t("weakFormulations")}
            items={feedback.weakFormulations}
            accent="var(--warning)"
            empty={t("weakFormulationsNone")}
          />
        </div>
      </div>
    </div>
  );
}
