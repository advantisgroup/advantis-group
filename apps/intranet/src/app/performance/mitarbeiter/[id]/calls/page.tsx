"use client";

import { useMemo } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART, tooltipStyle } from "@/components/activity/charts/theme";
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

export default function EmployeeCallsPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const token = getPerformanceToken();
  const [ym] = usePerformanceYm();
  const data = useQuery(
    api.performanceQueries.employeeDetail,
    token ? { token, employeeId, ym } : "skip"
  );

  const callsChart = useMemo(
    () =>
      (data?.days ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        answered: d.values.callsAnswered ?? 0,
        outbound: d.values.callsOutbound ?? 0,
      })),
    [data?.days, locale]
  );
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
    ? Math.round((data.cur?.loginSec ?? 0) / daysWithData)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <CallStatCard
          label={t("callsTotalLabel")}
          value={fmtNum(data.cur?.callsToday)}
          dVm={data.dVm.callsToday}
          dVj={data.dVj.callsToday}
        />
        <CallStatCard
          label={t("callsAnsweredLabel")}
          value={fmtNum(data.cur?.callsAnswered)}
          dVm={data.dVm.callsAnswered}
          dVj={data.dVj.callsAnswered}
        />
        <CallStatCard
          label={t("callsOutboundLabel")}
          value={fmtNum(data.cur?.callsOutbound)}
          dVm={data.dVm.callsOutbound}
          dVj={data.dVj.callsOutbound}
        />
        <CallStatCard
          label={t("callsAvgDurationLabel")}
          value={fmtDuration(data.cur?.talkAvgSec)}
          dVm={data.dVm.talkAvgSec}
          dVj={data.dVj.talkAvgSec}
        />
        <CallStatCard
          label={t("callsTotalTalkLabel")}
          value={fmtDuration(data.cur?.talkTotalSec)}
          dVm={data.dVm.talkTotalSec}
          dVj={data.dVj.talkTotalSec}
        />
        <CallStatCard
          label={t("callsLoginLabel")}
          value={fmtDuration(data.cur?.loginSec)}
          dVm={data.dVm.loginSec}
          dVj={data.dVj.loginSec}
        />
        <CallStatCard
          label={t("callsLoginPerDayLabel")}
          value={fmtDuration(loginPerDay)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("dashboardCallActivity")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={callsChart}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={32}
                />
                <Tooltip {...tooltipStyle} />
                <Bar
                  dataKey="answered"
                  name={t("callsAnsweredLabel")}
                  fill={CHART.active}
                  maxBarSize={12}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="outbound"
                  name={t("callsOutboundLabel")}
                  fill={CHART.accent}
                  maxBarSize={12}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("callsTotalTalkLabel")} / {t("callsLoginLabel")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={timeChart}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={32}
                  tickFormatter={(v: number) => fmtDuration(v)}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number) => fmtDuration(value)}
                />
                <Bar
                  dataKey="talk"
                  name={t("callsTotalTalkLabel")}
                  fill={CHART.idle}
                  maxBarSize={12}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="login"
                  name={t("callsLoginLabel")}
                  fill={CHART.info}
                  maxBarSize={12}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">{t("callsFootnote")}</p>
    </div>
  );
}
