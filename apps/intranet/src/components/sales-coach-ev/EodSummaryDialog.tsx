"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useEdenApi } from "@/lib/eden";
import { fetchEodSummary } from "@/lib/sales-coach-ev-api";

import { type CallRecord } from "./types";

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

export function EodSummaryDialog({
  open,
  onOpenChange,
  calls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calls: CallRecord[];
}) {
  const t = useTranslations("SalesCoachEv");
  const eden = useEdenApi();
  const handleError = useErrorHandler();
  const [summary, setSummary] = useState<{
    top3strengths: string[];
    top3improvements: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const scored = calls.filter((c) => c.scored && c.skillLevel != null);
  const ready = scored.length >= MILESTONE;

  useEffect(() => {
    if (!open || !ready) {
      setSummary(null);
      return;
    }
    setLoading(true);
    const recent = scored.slice(-MILESTONE);
    const strengths = recent.flatMap((c) => c.feedback?.strengths ?? []);
    const improvements = recent.flatMap((c) => c.feedback?.improvements ?? []);
    fetchEodSummary(eden, strengths.slice(0, 15), improvements.slice(0, 15))
      .then(setSummary)
      .catch((err) => handleError(err, t("eodSummaryFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready]);

  const today = new Date().toDateString();
  const todayCalls = scored.filter((c) => new Date(c.startedAt).toDateString() === today);
  const avgAll = scored.length
    ? Math.round(scored.reduce((sum, c) => sum + (c.skillLevel ?? 0), 0) / scored.length)
    : 0;
  const avgToday = todayCalls.length
    ? Math.round(todayCalls.reduce((sum, c) => sum + (c.skillLevel ?? 0), 0) / todayCalls.length)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("eodTitle")}</DialogTitle>
        </DialogHeader>

        {!ready ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="text-3xl">🎯</div>
            <div className="font-semibold">
              {t("eodMilestoneRemaining", { count: MILESTONE - scored.length })}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((scored.length / MILESTONE) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {scored.length}/{MILESTONE}
            </div>
          </div>
        ) : loading ? (
          <div className="py-8 text-center text-sm italic text-muted-foreground">
            {t("eodLoading")}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-center gap-6">
              <Ring value={avgAll} label={t("eodTotal")} />
              {todayCalls.length > 0 && <Ring value={avgToday} label={t("eodToday")} />}
              <div className="space-y-1 text-[13px] text-foreground/80">
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
            </div>
            {summary && (
              <>
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("eodTop3Strengths")}
                  </div>
                  {summary.top3strengths.map((s, i) => (
                    <div
                      key={i}
                      className="mb-1.5 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[13px]"
                    >
                      <span className="grid size-5 shrink-0 place-items-center rounded-full border border-emerald-500 bg-emerald-500/10 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        {i + 1}
                      </span>
                      {s}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("eodTop3Improvements")}
                  </div>
                  {summary.top3improvements.map((s, i) => (
                    <div
                      key={i}
                      className="mb-1.5 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[13px]"
                    >
                      <span className="grid size-5 shrink-0 place-items-center rounded-full border border-amber-500 bg-amber-500/10 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        {i + 1}
                      </span>
                      {s}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
