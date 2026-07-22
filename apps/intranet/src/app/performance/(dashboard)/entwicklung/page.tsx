"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FilterableBarChart } from "@/components/activity/charts/FilterableBarChart";
import { CHART, tooltipStyle } from "@/components/activity/charts/theme";
import { ClosedWonTrendChart } from "@/components/performance/ClosedWonTrendChart";
import { fmtDayShort, fmtYm } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function DashboardDevelopmentPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const token = getPerformanceToken() ?? "";
  const data = useQuery(api.performanceQueries.teamDevelopment, { token });

  const funnelChart = useMemo(
    () =>
      (data?.monthly ?? []).map(m => ({
        label: fmtYm(m.ym, locale),
        leads: m.leadsCreated ?? 0,
        workable: m.workableCreated ?? 0,
        won: m.wonMonth ?? 0,
        unqualified: m.unqualifiedTotal,
      })),
    [data?.monthly, locale]
  );
  const hitrateChart = useMemo(
    () =>
      (data?.monthly ?? []).map(m => ({
        label: fmtYm(m.ym, locale),
        hitrate: m.hitrate ?? null,
      })),
    [data?.monthly, locale]
  );
  const callsPerDayChart = useMemo(
    () =>
      (data?.callsPerDay ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        calls: d.values.callsToday ?? 0,
      })),
    [data?.callsPerDay, locale]
  );
  const leadsAnalysisChart = useMemo(
    () =>
      (data?.leadsAnalysisPerDay ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        value: d.value,
      })),
    [data?.leadsAnalysisPerDay, locale]
  );
  const leadsDetailsIdentChart = useMemo(
    () =>
      (data?.leadsDetailsIdentPerDay ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        value: d.value,
      })),
    [data?.leadsDetailsIdentPerDay, locale]
  );
  const oppsOpenChart = useMemo(
    () =>
      (data?.oppsOpenPerDay ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        value: d.value,
      })),
    [data?.oppsOpenPerDay, locale]
  );

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("developmentSubtitle")}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("developmentFunnelTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FilterableBarChart
              data={funnelChart}
              series={[
                {
                  key: "leads",
                  name: t("dashboardLeadsCreatedMonth"),
                  color: CHART.info,
                },
                {
                  key: "workable",
                  name: t("colWorkable"),
                  color: CHART.active,
                },
                { key: "won", name: t("colWon"), color: CHART.accent },
                {
                  key: "unqualified",
                  name: t("developmentUnqualifiedLabel"),
                  color: CHART.idle,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("hitrateHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={hitrateChart}
                margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
              >
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={40}
                  unit="%"
                />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="hitrate"
                  name={t("dashboardMetricHitrate")}
                  stroke={CHART.accent}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <ClosedWonTrendChart
        days={data.closedWonPerDay}
        avg={data.wonPerDayAvg}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("developmentCallsPerDayTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilterableBarChart
            data={callsPerDayChart}
            series={[
              { key: "calls", name: t("callsTotalLabel"), color: CHART.active },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(
          [
            {
              title: t("developmentLeadsAnalysisTrendTitle"),
              chart: leadsAnalysisChart,
              color: CHART.info,
            },
            {
              title: t("developmentLeadsDetailsIdentTrendTitle"),
              chart: leadsDetailsIdentChart,
              color: CHART.accent,
            },
            {
              title: t("developmentOppsOpenTrendTitle"),
              chart: oppsOpenChart,
              color: CHART.idle,
            },
          ] as const
        ).map(panel => (
          <Card key={panel.title}>
            <CardHeader>
              <CardTitle className="text-base">{panel.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={panel.chart}
                  margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
                >
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={CHART.axis}
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={CHART.axis}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={36}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={panel.color}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
