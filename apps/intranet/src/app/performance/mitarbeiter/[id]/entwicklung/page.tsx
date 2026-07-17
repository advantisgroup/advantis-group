"use client";

import { useMemo } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
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

  const histChart = useMemo(
    () =>
      (data?.hist ?? []).map(h => ({
        label: h.ym ? fmtYm(h.ym, locale) : "",
        hitrate: h.hitrate ?? null,
      })),
    [data?.hist, locale]
  );

  if (!data) return <PerformanceContentSkeleton />;

  if (histChart.length <= 1) {
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
        <CardTitle className="text-base">{t("hitrateHistory")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={histChart}
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
  );
}
