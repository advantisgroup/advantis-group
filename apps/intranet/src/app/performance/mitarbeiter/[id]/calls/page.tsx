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
import { fmtDayShort } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPerformanceToken } from "@/lib/performanceAuth";

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

  const dayChart = useMemo(
    () =>
      (data?.days ?? []).map(d => ({
        label: fmtDayShort(d.date, locale),
        calls: d.values.callsToday ?? 0,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("dashboardCallActivity")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={dayChart}
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
              dataKey="calls"
              name={t("dashboardMetricCalls")}
              fill={CHART.accent}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
