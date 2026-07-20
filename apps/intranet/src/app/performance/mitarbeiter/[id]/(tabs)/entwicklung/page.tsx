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

import { FilterableBarChart } from "@/components/activity/charts/FilterableBarChart";
import { CHART, tooltipStyle } from "@/components/activity/charts/theme";
import {
  fmtNum,
  fmtPct,
  fmtYm,
} from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function EmployeeDevelopmentPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const token = getPerformanceToken() ?? "";
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.employeeDetail, {
    token,
    employeeId,
    ym,
  });

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
            ]}
          />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("historicalMonthlyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colMonth")}</TableHead>
                <TableHead className="text-right">{t("colLeads")}</TableHead>
                <TableHead className="text-right">{t("colWorkable")}</TableHead>
                <TableHead className="text-right">
                  {t("colWorkableRate")}
                </TableHead>
                <TableHead className="text-right">{t("colWon")}</TableHead>
                <TableHead className="text-right">{t("colHitrate")}</TableHead>
                <TableHead className="text-right">
                  {t("colWonPerDay")}
                </TableHead>
                <TableHead className="text-right">{t("colWorkdays")}</TableHead>
                <TableHead className="text-right">{t("colForecast")}</TableHead>
                <TableHead className="text-right">{t("colOppsOpen")}</TableHead>
                <TableHead className="text-right">{t("colClose7d")}</TableHead>
                <TableHead className="text-right">
                  {t("colAnalysis30")}
                </TableHead>
                <TableHead className="text-right">
                  {t("colOppOverdue")}
                </TableHead>
                <TableHead className="text-right">{t("colOpps30")}</TableHead>
                <TableHead className="text-right">{t("colLeads14")}</TableHead>
                <TableHead className="text-right">{t("colOpps14")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data.hist].reverse().map(h => (
                <TableRow key={h.ym}>
                  <TableCell className="font-medium">
                    {h.ym ? fmtYm(h.ym, locale) : "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.leadsCreated)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.workableCreated)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPct(h.workableRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.wonMonth)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPct(h.hitrate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.wonPerDay)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {h.fc ? `${h.fc.elapsed}/${h.fc.total}` : "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.fc1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.oppsOpen)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.oppsClose7d)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.overduesAnalysis)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.overduesOpps)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.oppsOver30)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.leadsNoAction14)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(h.oppsNoAction14)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
