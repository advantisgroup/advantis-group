"use client";

import { useMemo } from "react";

import { useLocale, useTranslations } from "next-intl";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSalesCoachAdminUserDetail } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

import { CategoryRadarChart } from "./CategoryRadarChart";
import { SCORE_CATEGORIES, fmtDuration, outcomeLabel, scoreColorClass } from "./constants";
import { SkillLineChart } from "./SkillLineChart";
import { type RosterEntry } from "./types";

/**
 * Team tab's per-rep drill-down, opened by clicking a roster card — reuses
 * that card's already-fetched aggregates (avgScore/callCount/appointments/
 * trend, same `days` window) for the stat row, and fetches only the
 * per-call rows (`adminUserDetail`) needed for the skill-history/category
 * charts and the call list. Never shows transcript/feedback content — see
 * `adminUserDetail` in packages/convex/convex/salesCoachEv/calls.ts.
 */
export function AdminUserDetailDialog({
  entry,
  days,
  open,
  onOpenChange,
}: {
  entry: RosterEntry | null;
  days: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("SalesCoachEv");
  const locale = useLocale();
  const { detail } = useSalesCoachAdminUserDetail(entry?.clerkUserId ?? null, days);

  const calls = detail?.calls ?? [];
  const scored = useMemo(
    () => (detail?.calls ?? []).filter((c) => c.scored && c.skillLevel != null),
    [detail],
  );
  const sorted = useMemo(() => [...scored].sort((a, b) => a.startedAt - b.startedAt), [scored]);

  const avgDuration = calls.length
    ? Math.round(calls.reduce((sum, c) => sum + c.durationSec, 0) / calls.length)
    : 0;

  const lineData = sorted.map((c) => ({
    label: new Date(c.startedAt).toLocaleDateString(locale),
    score: c.skillLevel ?? 0,
  }));

  const radarData = SCORE_CATEGORIES.map((cat) => {
    const values = scored.map((c) => c.scores?.[cat.key]).filter((v): v is number => v != null);
    return {
      label: cat.label,
      value: values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0,
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{entry?.userName}</DialogTitle>
        </DialogHeader>
        {!entry ? null : detail === undefined ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : (
          <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-border p-4">
                <div
                  className={cn(
                    "font-mono text-2xl font-extrabold",
                    scoreColorClass(entry.avgScore),
                  )}
                >
                  {entry.avgScore}
                </div>
                <div className="text-xs text-muted-foreground">{t("statSkillScore")}</div>
                <div
                  className={cn(
                    "mt-1 text-xs font-semibold",
                    entry.trend >= 0 ? "text-ok" : "text-destructive",
                  )}
                >
                  {entry.trend >= 0 ? "↑" : "↓"} {Math.abs(entry.trend)}
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="font-mono text-2xl font-extrabold">{entry.callCount}</div>
                <div className="text-xs text-muted-foreground">{t("statScoredCalls")}</div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="font-mono text-2xl font-extrabold text-primary">
                  {entry.appointments}
                </div>
                <div className="text-xs text-muted-foreground">{t("statAppointments")}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {entry.callCount ? Math.round((entry.appointments / entry.callCount) * 100) : 0}%{" "}
                  {t("statRate")}
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="font-mono text-2xl font-extrabold">{fmtDuration(avgDuration)}</div>
                <div className="text-xs text-muted-foreground">{t("statAvgDuration")}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <div className="mb-2 text-sm font-semibold">{t("skillHistory")}</div>
                {lineData.length > 1 ? (
                  <SkillLineChart points={lineData} />
                ) : (
                  <div className="flex h-[180px] items-center justify-center text-sm italic text-muted-foreground">
                    {t("notEnoughData")}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="mb-2 text-sm font-semibold">{t("categoryProfile")}</div>
                {scored.length > 0 ? (
                  <CategoryRadarChart points={radarData} />
                ) : (
                  <div className="flex h-[180px] items-center justify-center text-sm italic text-muted-foreground">
                    {t("notEnoughData")}
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border px-4 py-2 text-sm font-semibold">
                {t("callsTitle")}
              </div>
              {calls.length === 0 ? (
                <div className="p-6 text-center text-sm italic text-muted-foreground">
                  {t("noCallsYet")}
                </div>
              ) : (
                [...calls].reverse().map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-sm first:border-t-0"
                  >
                    <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                      {new Date(c.startedAt).toLocaleString(locale, {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                      {fmtDuration(c.durationSec)}
                    </span>
                    <span
                      className={cn(
                        "w-10 shrink-0 font-mono text-sm font-bold",
                        scoreColorClass(c.skillLevel),
                      )}
                    >
                      {c.skillLevel ?? "-"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        c.outcome === "termin"
                          ? "bg-primary/10 text-primary"
                          : c.outcome === "wiedervorlage"
                            ? "bg-info/10 text-info"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {outcomeLabel(c.outcome)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
