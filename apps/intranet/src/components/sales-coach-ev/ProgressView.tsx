"use client";

import { useMemo, useState } from "react";

import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSalesCoachCalls } from "@/lib/sales-coach-ev-api";
import { cn } from "@/lib/utils";

import { CategoryRadarChart } from "./CategoryRadarChart";
import { SCORE_CATEGORIES, fmtDuration, outcomeLabel, scoreColorClass } from "./constants";
import { SkillLineChart } from "./SkillLineChart";
import { type CallRecord } from "./types";

type Period = "7" | "30" | "all";

export function ProgressView() {
  const t = useTranslations("SalesCoachEv");
  const locale = useLocale();
  const [period, setPeriod] = useState<Period>("7");
  const { calls } = useSalesCoachCalls(period);

  const scored = useMemo(
    () => (calls ?? []).filter((c) => c.scored && c.skillLevel != null),
    [calls],
  );
  const sorted = useMemo(() => [...scored].sort((a, b) => a.startedAt - b.startedAt), [scored]);

  const avg = scored.length
    ? Math.round(scored.reduce((sum, c) => sum + (c.skillLevel ?? 0), 0) / scored.length)
    : 0;
  const appointments = (calls ?? []).filter((c) => c.outcome === "termin").length;
  const wiedervorlagen = (calls ?? []).filter((c) => c.outcome === "wiedervorlage").length;
  const avgDuration = calls?.length
    ? Math.round(calls.reduce((sum, c) => sum + c.durationSec, 0) / calls.length)
    : 0;

  const half = Math.ceil(sorted.length / 2);
  const avg1 = half ? avgOf(sorted.slice(0, half)) : 0;
  const avg2 = avgOf(sorted.slice(half));
  const trend = avg2 - avg1;

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["7", "30", "all"] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
              className="rounded-full text-xs"
            >
              {p === "7" ? t("period7") : p === "30" ? t("period30") : t("periodAll")}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/sales-coach-ev/progress/summary">{t("endTraining")}</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className={cn("font-mono text-2xl font-extrabold", scoreColorClass(avg))}>
              {avg}
            </div>
            <div className="text-xs text-muted-foreground">{t("statSkillScore")}</div>
            <div
              className={cn(
                "mt-1 text-xs font-semibold",
                trend >= 0 ? "text-ok" : "text-destructive",
              )}
            >
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="font-mono text-2xl font-extrabold">{scored.length}</div>
            <div className="text-xs text-muted-foreground">{t("statScoredCalls")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="font-mono text-2xl font-extrabold text-primary">{appointments}</div>
            <div className="text-xs text-muted-foreground">{t("statAppointments")}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {calls?.length ? Math.round((appointments / calls.length) * 100) : 0}% {t("statRate")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="font-mono text-2xl font-extrabold">{fmtDuration(avgDuration)}</div>
            <div className="text-xs text-muted-foreground">{t("statAvgDuration")}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {wiedervorlagen} {t("statFollowUps")}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("skillHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {lineData.length > 1 ? (
              <SkillLineChart points={lineData} />
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm italic text-muted-foreground">
                {t("notEnoughData")}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("categoryProfile")}</CardTitle>
          </CardHeader>
          <CardContent>
            {scored.length > 0 ? (
              <CategoryRadarChart points={radarData} />
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm italic text-muted-foreground">
                {t("notEnoughData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("callsTitle")}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {t("callsInPeriod", { count: calls?.length ?? 0 })}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {!calls?.length ? (
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
                {/* Unscored calls link too — the report page can score them. */}
                <Button size="sm" variant="ghost" className="ml-auto text-xs" asChild>
                  <Link href={`/sales-coach-ev/progress/${c.id}`}>{t("details")}</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function avgOf(rows: CallRecord[]): number {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((sum, c) => sum + (c.skillLevel ?? 0), 0) / rows.length);
}
