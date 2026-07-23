"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { FilterableBarChart } from "@/components/activity/charts/FilterableBarChart";
import { CHART } from "@/components/activity/charts/theme";
import {
  DeltaPair,
  fmtDayShort,
  fmtDuration,
  fmtNum,
} from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPerformanceToken } from "@/lib/performanceAuth";

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

export default function DashboardCallsPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const token = getPerformanceToken() ?? "";
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.teamDashboard, { token, ym });

  // The "Call-Aktivität" chart (answered/outbound) no longer renders here —
  // it's promoted to the top of the page by (dashboard)/layout.tsx's
  // DashboardTopSection for this tab, so it isn't shown twice.
  const timeChart = useMemo(
    () =>
      (data?.days ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        talk: d.values.talkTotalSec ?? 0,
        login: d.values.loginSec ?? 0,
      })),
    [data?.days, locale]
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

  const daysWithData = data.days.filter(
    d => d.values.callsToday !== undefined
  ).length;
  const loginPerDay = daysWithData
    ? Math.round((data.total.loginSec ?? 0) / daysWithData)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <CallStatCard
          label={t("callsTotalLabel")}
          value={fmtNum(data.total.callsToday)}
          dVm={data.dVm.callsToday}
          dVj={data.dVj.callsToday}
        />
        <CallStatCard
          label={t("callsAnsweredLabel")}
          value={fmtNum(data.total.callsAnswered)}
          dVm={data.dVm.callsAnswered}
          dVj={data.dVj.callsAnswered}
        />
        <CallStatCard
          label={t("callsOutboundLabel")}
          value={fmtNum(data.total.callsOutbound)}
          dVm={data.dVm.callsOutbound}
          dVj={data.dVj.callsOutbound}
        />
        <CallStatCard
          label={t("callsAvgDurationLabel")}
          value={fmtDuration(data.total.talkAvgSec)}
          dVm={data.dVm.talkAvgSec}
          dVj={data.dVj.talkAvgSec}
        />
        <CallStatCard
          label={t("callsTotalTalkLabel")}
          value={fmtDuration(data.total.talkTotalSec)}
          dVm={data.dVm.talkTotalSec}
          dVj={data.dVj.talkTotalSec}
        />
        <CallStatCard
          label={t("callsLoginLabel")}
          value={fmtDuration(data.total.loginSec)}
          dVm={data.dVm.loginSec}
          dVj={data.dVj.loginSec}
        />
        <CallStatCard
          label={t("callsLoginPerDayLabel")}
          value={fmtDuration(loginPerDay)}
        />
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
              },
              {
                key: "login",
                name: t("callsLoginLabel"),
                color: CHART.info,
              },
            ]}
            yTickFormatter={(v: number) => fmtDuration(v)}
            tooltipFormatter={(value: number) => fmtDuration(value)}
            yScale="log"
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("callsFootnote")}</p>
    </div>
  );
}
