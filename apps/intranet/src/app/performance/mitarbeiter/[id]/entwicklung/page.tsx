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
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART, tooltipStyle } from "@/components/activity/charts/theme";
import { fmtYm } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function EmployeeDevelopmentPage() {
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

  const rateChart = useMemo(
    () =>
      (data?.hist ?? []).map(h => ({
        label: h.ym ? fmtYm(h.ym, locale) : "",
        hitrate: h.hitrate ?? null,
        workableRate: h.workableRate ?? null,
      })),
    [data?.hist, locale]
  );
  const funnelChart = useMemo(
    () =>
      (data?.hist ?? []).map(h => ({
        label: h.ym ? fmtYm(h.ym, locale) : "",
        leads: h.leadsCreated ?? 0,
        workable: h.workableCreated ?? 0,
        won: h.wonMonth ?? 0,
      })),
    [data?.hist, locale]
  );
  const wonPerDayChart = useMemo(
    () =>
      (data?.hist ?? []).map(h => ({
        label: h.ym ? fmtYm(h.ym, locale) : "",
        wonPerDay: h.wonPerDay ?? null,
      })),
    [data?.hist, locale]
  );

  if (!data) return <PerformanceContentSkeleton />;

  if (rateChart.length <= 1) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {t("dashboardEmptyBody")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("hitrateHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={rateChart}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
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
                  width={32}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("workableRateHistory")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={rateChart}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
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
                  width={32}
                  unit="%"
                />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="workableRate"
                  name={t("dashboardWorkableRate")}
                  stroke={CHART.info}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("leadsWorkableWonHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={funnelChart}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
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
                width={32}
              />
              <Tooltip {...tooltipStyle} />
              <Bar
                dataKey="leads"
                name={t("dashboardLeadsCreatedMonth")}
                fill={CHART.info}
                maxBarSize={10}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="workable"
                name={t("colWorkable")}
                fill={CHART.active}
                maxBarSize={10}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="won"
                name={t("colWon")}
                fill={CHART.accent}
                maxBarSize={10}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("wonPerWorkdayHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={wonPerDayChart}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
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
                width={32}
              />
              <Tooltip {...tooltipStyle} />
              <Line
                type="monotone"
                dataKey="wonPerDay"
                name={t("dashboardWonPerWorkday")}
                stroke={CHART.idle}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("wonPerWorkdayFootnote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
