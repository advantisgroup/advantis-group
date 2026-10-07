"use client";

import { useMemo } from "react";

import { useLocale, useTranslations } from "next-intl";

import { FilterableBarChart } from "@/components/charts/FilterableBarChart";
import { CHART } from "@/components/charts/theme";
import {
  DeltaPair,
  fmtDayShort,
  fmtDuration,
  fmtNum,
} from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CallMetrics {
  callsToday?: number;
  callsAnswered?: number;
  callsOutbound?: number;
  talkAvgSec?: number;
  talkTotalSec?: number;
  loginSec?: number;
}

interface CallsData {
  hasCalls: boolean;
  days: { date: string; values: CallMetrics }[];
  dVm: CallMetrics;
  dVj: CallMetrics;
}

function CallStatCard({
  label,
  value,
  dVm,
  dVj,
}: {
  label: string;
  value: string;
  dVm?: number;
  dVj?: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        <DeltaPair dVm={dVm} dVj={dVj} />
      </CardContent>
    </Card>
  );
}

/** The "Calls" tab body, shared by the team dashboard and one employee's page.
 * The answered/outbound chart isn't here — each layout promotes it to the top
 * of the page for this tab, so it isn't shown twice. */
export function CallsTab({
  data,
  totals,
  statsGridClassName,
}: {
  data: CallsData | null | undefined;
  totals: CallMetrics | undefined;
  statsGridClassName: string;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();

  const timeChart = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        label: fmtDayShort(d.date, locale),
        talk: d.values.talkTotalSec ?? 0,
        login: d.values.loginSec ?? 0,
      })),
    [data?.days, locale],
  );

  if (!data) return <PerformanceContentSkeleton />;

  if (!data.hasCalls) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {t("dashboardEmptyBody")}
        </CardContent>
      </Card>
    );
  }

  const daysWithData = data.days.filter((d) => d.values.callsToday !== undefined).length;
  const loginPerDay = daysWithData ? Math.round((totals?.loginSec ?? 0) / daysWithData) : undefined;

  return (
    <div className="space-y-6">
      <div className={cn("grid gap-3 sm:grid-cols-3 lg:grid-cols-4", statsGridClassName)}>
        <CallStatCard
          label={t("callsTotalLabel")}
          value={fmtNum(totals?.callsToday)}
          dVm={data.dVm.callsToday}
          dVj={data.dVj.callsToday}
        />
        <CallStatCard
          label={t("callsAnsweredLabel")}
          value={fmtNum(totals?.callsAnswered)}
          dVm={data.dVm.callsAnswered}
          dVj={data.dVj.callsAnswered}
        />
        <CallStatCard
          label={t("callsOutboundLabel")}
          value={fmtNum(totals?.callsOutbound)}
          dVm={data.dVm.callsOutbound}
          dVj={data.dVj.callsOutbound}
        />
        <CallStatCard
          label={t("callsAvgDurationLabel")}
          value={fmtDuration(totals?.talkAvgSec)}
          dVm={data.dVm.talkAvgSec}
          dVj={data.dVj.talkAvgSec}
        />
        <CallStatCard
          label={t("callsTotalTalkLabel")}
          value={fmtDuration(totals?.talkTotalSec)}
          dVm={data.dVm.talkTotalSec}
          dVj={data.dVj.talkTotalSec}
        />
        <CallStatCard
          label={t("callsLoginLabel")}
          value={fmtDuration(totals?.loginSec)}
          dVm={data.dVm.loginSec}
          dVj={data.dVj.loginSec}
        />
        <CallStatCard label={t("callsLoginPerDayLabel")} value={fmtDuration(loginPerDay)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("callsTotalTalkLabel")} / {t("callsLoginLabel")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilterableBarChart
            data={timeChart}
            series={[
              {
                key: "talk",
                name: t("callsTotalTalkLabel"),
                color: CHART.idle,
                axis: "left",
              },
              {
                key: "login",
                name: t("callsLoginLabel"),
                color: CHART.info,
                axis: "right",
              },
            ]}
            yTickFormatter={(v: number) => fmtDuration(v)}
            tooltipFormatter={(value: number) => fmtDuration(value)}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("callsFootnote")}</p>
    </div>
  );
}
