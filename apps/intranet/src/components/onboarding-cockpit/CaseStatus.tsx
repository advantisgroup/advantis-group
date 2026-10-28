"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  type FollowUpReason,
  type Milestone,
  MILESTONES,
  suggestFollowUp,
} from "@advantis/convex/performance/onboarding";
import { useMutation } from "convex/react";
import { ArrowRight, CalendarPlus, Check, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { STATUS_ORDER, TimeSelect, useOutcomeLabel, useStatusName } from "./shared";

interface CaseStatusData {
  _id: Id<"onboardingCases">;
  status: string;
  outcomePath: string[];
  outcomeText: string | null;
  outcomeAt: number | null;
  outcomeByName: string | null;
  milestones: string[];
  nextFollowUp: string | null;
}

/** Which follow-up to suggest after ticking a milestone. */
const SUGGEST_AFTER: Partial<Record<Milestone, FollowUpReason>> = {
  cards: "cards",
  fuel: "fuel",
};

/**
 * Where the case stands: the phase ladder (Neu → In Kontakt → Karten
 * bestellt → Getankt → Abgeschlossen) driven by the three milestone ticks,
 * the situation of the last contact, and – after ticking "Karten bestellt"
 * or "Getankt" – the matching follow-up (1 week / 2 months) ready to
 * create with one click.
 */
export function CaseStatus({ data }: { data: CaseStatusData }) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const statusName = useStatusName();
  const outcomeLabel = useOutcomeLabel();
  const update = useMutation(api.performance.onboarding.update);
  const [suggestion, setSuggestion] = useState<{
    reason: FollowUpReason;
    date: string;
    time: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Omit<Parameters<typeof update>[0], "caseId">) => {
    setBusy(true);
    try {
      await update({ caseId: data._id, ...patch });
      return true;
    } catch (e) {
      handleError(e, t("case.saveError"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (key: Milestone, done: boolean) => {
    const ok = await save({ milestone: { key, done } });
    const reason = SUGGEST_AFTER[key];
    if (ok && done && reason) setSuggestion({ reason, ...suggestFollowUp(new Date(), reason) });
    else setSuggestion(null);
  };

  const createSuggested = async () => {
    if (!suggestion) return;
    const ok = await save({
      nextFollowUp: suggestion.date,
      nextFollowUpTime: suggestion.time || null,
    });
    if (ok) {
      toast.success(t("phase.followUpCreated"));
      setSuggestion(null);
    }
  };

  const current = outcomeLabel(data);
  const winback = data.status === "winback";
  const ladder = STATUS_ORDER.filter((s) => s !== "winback");
  const here = ladder.indexOf(data.status as (typeof ladder)[number]);

  return (
    <section className="space-y-4 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("phase.title")}</h3>
        {winback ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void save({ status: "open" })}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            {t("phase.reopen")}
          </Button>
        ) : null}
      </div>

      {/* The ladder */}
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {ladder.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2.5 py-1",
                !winback && i === here && "border-foreground bg-foreground text-background",
                !winback && i < here && "border-ok/30 bg-ok/10 text-ok",
                (winback || i > here) && "border-border/70 text-muted-foreground",
              )}
            >
              {statusName(s)}
            </span>
            {i < ladder.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </li>
        ))}
        {winback && (
          <li className="ml-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-destructive">
            {statusName("winback")}
          </li>
        )}
      </ol>

      {/* The three ticks */}
      <div className="grid gap-2 sm:grid-cols-3">
        {MILESTONES.map((m) => {
          const done = data.milestones.includes(m);
          return (
            <button
              key={m}
              type="button"
              disabled={busy || winback}
              onClick={() => void toggle(m, !done)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                done ? "border-ok/40 bg-ok/10 text-ok" : "border-border/70 hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  done ? "border-ok bg-ok text-background" : "border-border",
                )}
              >
                {done && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="font-medium">{t(`steps.${m}`)}</span>
            </button>
          );
        })}
      </div>

      {suggestion && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <span className="mr-auto">{t(`phase.suggest.${suggestion.reason}`)}</span>
          <Input
            type="date"
            className="h-8 w-[160px]"
            value={suggestion.date}
            onChange={(e) => setSuggestion({ ...suggestion, date: e.target.value })}
          />
          <TimeSelect
            className="h-8"
            value={suggestion.time}
            onChange={(time) => setSuggestion({ ...suggestion, time })}
          />
          <Button
            size="sm"
            disabled={busy || !suggestion.date}
            onClick={() => void createSuggested()}
          >
            {t("phase.createFollowUp")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
            {t("phase.skip")}
          </Button>
          {data.nextFollowUp && (
            <p className="w-full text-xs text-muted-foreground">
              {t("phase.replaces", { date: formatIsoDate(data.nextFollowUp, locale) })}
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t("situation.current")}: </span>
        {current ? (
          <>
            <span className="font-medium">{current}</span>
            {data.outcomeText && (
              <span className="block whitespace-pre-wrap">{data.outcomeText}</span>
            )}
            {data.outcomeAt && (
              <span className="block text-xs text-muted-foreground">
                {formatDateTime(data.outcomeAt, locale)} · {data.outcomeByName}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{t("situation.none")}</span>
        )}
      </div>
    </section>
  );
}
