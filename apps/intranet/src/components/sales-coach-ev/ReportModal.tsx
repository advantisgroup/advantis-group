"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { SCORE_CATEGORIES, fmtDuration, outcomeLabel, scoreColorClass } from "./constants";
import { type CallRecord } from "./types";

export function ReportModal({
  call,
  open,
  onOpenChange,
}: {
  call: CallRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("SalesCoachEv");
  if (!call || !call.scores || !call.feedback) return null;

  const { scores, feedback, skillLevel } = call;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>{t("reportTitle")}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {fmtDuration(call.durationSec)} · {outcomeLabel(call.outcome)}
              </p>
            </div>
            <div className="text-right">
              <div className={cn("font-mono text-3xl font-extrabold", scoreColorClass(skillLevel))}>
                {skillLevel}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("skillScore")}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("skillBreakdown")}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {SCORE_CATEGORIES.map((cat) => {
                const value = scores[cat.key];
                return (
                  <div key={cat.key} className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-semibold">{cat.label}</span>
                      <span className={cn("font-mono text-sm font-bold", scoreColorClass(value))}>
                        {value}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-border">
                      <div
                        className={cn(
                          "h-full rounded",
                          value >= 70
                            ? "bg-emerald-500"
                            : value >= 45
                              ? "bg-amber-500"
                              : "bg-red-500",
                        )}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    {feedback.comments[cat.key] && (
                      <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {feedback.comments[cat.key]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("missingInfos")}
            </div>
            {feedback.missingInfos.length ? (
              feedback.missingInfos.map((m, i) => (
                <div
                  key={i}
                  className="mb-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  {m}
                </div>
              ))
            ) : (
              <div className="text-xs text-emerald-600 dark:text-emerald-400">
                {t("missingInfosNone")}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("weakFormulations")}
            </div>
            {feedback.weakFormulations.length ? (
              feedback.weakFormulations.map((w, i) => (
                <div
                  key={i}
                  className="mb-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  {w}
                </div>
              ))
            ) : (
              <div className="text-xs text-emerald-600 dark:text-emerald-400">
                {t("weakFormulationsNone")}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="rounded-lg border-l-[3px] border-l-emerald-500 border-border bg-muted/40 p-3">
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                {t("strengths")}
              </div>
              <ul className="space-y-1 text-[13px] leading-relaxed text-foreground/85">
                {feedback.strengths.map((s, i) => (
                  <li key={i}>→ {s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border-l-[3px] border-l-orange-500 border-border bg-muted/40 p-3">
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                {t("improvements")}
              </div>
              <ul className="space-y-1 text-[13px] leading-relaxed text-foreground/85">
                {feedback.improvements.map((s, i) => (
                  <li key={i}>→ {s}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
            <div className="mb-1.5 text-[13px] font-bold text-primary">{t("nextSteps")}</div>
            <ul className="space-y-1 text-[13px] leading-relaxed text-foreground/85">
              {feedback.nextSteps.map((s, i) => (
                <li key={i}>+ {s}</li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
