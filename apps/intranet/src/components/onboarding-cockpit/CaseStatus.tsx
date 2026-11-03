"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { isClosedStatus, MILESTONES } from "@advantis/convex/performance/onboarding";
import { useMutation } from "convex/react";
import { ArrowRight, Check, RotateCcw, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { LADDER, useOutcomeLabel, useStatusName } from "./shared";

interface CaseStatusData {
  _id: Id<"onboardingCases">;
  status: string;
  outcomePath: string[];
  outcomeText: string | null;
  outcomeAt: number | null;
  outcomeByName: string | null;
  milestones: string[];
  itOpenSince: number | null;
}

/**
 * Where the case stands – display only (feedback 03.11.): the phase ladder
 * (Neu → In Kontakt → Karten bestellt → Getankt → Abgeschlossen), the three
 * milestones (ticked below in "Kontakt festhalten"), an open IT case with
 * "IT erledigt", and the situation of the last contact. A closed case can
 * be reopened here.
 */
export function CaseStatus({ data }: { data: CaseStatusData }) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const statusName = useStatusName();
  const outcomeLabel = useOutcomeLabel();
  const update = useMutation(api.performance.onboarding.update);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Omit<Parameters<typeof update>[0], "caseId">, done?: string) => {
    setBusy(true);
    try {
      await update({ caseId: data._id, ...patch });
      if (done) toast.success(done);
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const current = outcomeLabel(data);
  const closed = isClosedStatus(data.status);
  /** Closed in one of the archive lists (not "done"). */
  const offLadder = closed && data.status !== "done";
  const here = LADDER.indexOf(data.status as (typeof LADDER)[number]);

  return (
    <section className="space-y-4 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("phase.title")}</h3>
        {closed ? (
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
        {LADDER.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2.5 py-1",
                !offLadder && i === here && "border-foreground bg-foreground text-background",
                !offLadder && i < here && "border-ok/30 bg-ok/10 text-ok",
                (offLadder || i > here) && "border-border/70 text-muted-foreground",
              )}
            >
              {statusName(s)}
            </span>
            {i < LADDER.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </li>
        ))}
        {offLadder && (
          <li className="ml-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-destructive">
            {statusName(data.status)}
          </li>
        )}
      </ol>

      {/* The three milestones – shown here, ticked in the contact form. */}
      <div className="flex flex-wrap gap-2">
        {MILESTONES.map((m) => {
          const done = data.milestones.includes(m);
          return (
            <span
              key={m}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                done ? "border-ok/40 bg-ok/10 text-ok" : "border-border/70 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded-sm border",
                  done ? "border-ok bg-ok text-background" : "border-border",
                )}
              >
                {done && <Check className="h-2.5 w-2.5" />}
              </span>
              {t(`steps.${m}`)}
            </span>
          );
        })}
      </div>

      {data.itOpenSince !== null && !closed && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Wrench className="h-4 w-4 text-primary" />
          <span className="mr-auto">
            {t("phase.itOpen", { date: formatDateTime(data.itOpenSince, locale) })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void save({ itDone: true }, t("phase.itDoneSaved"))}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {t("phase.itDone")}
          </Button>
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
