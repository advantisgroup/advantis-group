"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART, tooltipStyle } from "@/components/charts/theme";
import { fmtDayShort, fmtNum } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/format";

export interface WallboxHistorySeries {
  key: string;
  name: string;
  color: string;
}

/** One line per series over the Wallbox report days. */
export function WallboxHistoryChart({
  history,
  series,
  height = 260,
}: {
  history: ({ date: string } & Record<string, number | string | null>)[];
  series: WallboxHistorySeries[];
  height?: number;
}) {
  const locale = useLocale();
  const data = history.map((h) => ({ ...h, label: fmtDayShort(h.date, locale) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
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
          width={36}
          allowDecimals={false}
        />
        <Tooltip {...tooltipStyle} />
        {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Entwicklung of a Wallbox dashboard: the campaign totals per report day. */
export function WallboxDevelopment({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const data = useQuery(api.performance.wallbox.overview, { companyId });

  if (!data) return <PerformanceContentSkeleton />;
  if (data.history.length === 0) {
    return <EmptyState title={t("wallbox.emptyTitle")} description={t("wallbox.emptyBody")} />;
  }

  const history = data.history;
  const columns = [
    { key: "members", label: t("wallbox.kpiMembers") },
    { key: "inProgress", label: t("wallbox.inProgress") },
    { key: "opps", label: t("wallbox.opps") },
    { key: "open", label: t("wallbox.open") },
    { key: "won", label: t("wallbox.won") },
    { key: "lost", label: t("wallbox.lost") },
  ] as const;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {history.length < 2 ? t("wallbox.devOnePoint") : t("wallbox.devSubtitle")}
      </p>

      {history.length >= 2 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("wallbox.devOppsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <WallboxHistoryChart
                history={history}
                series={[
                  { key: "opps", name: t("wallbox.opps"), color: CHART.accent },
                  { key: "open", name: t("wallbox.open"), color: CHART.info },
                  { key: "won", name: t("wallbox.won"), color: CHART.active },
                  { key: "lost", name: t("wallbox.lost"), color: CHART.idle },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("wallbox.devInProgressTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <WallboxHistoryChart
                history={history}
                series={[{ key: "inProgress", name: t("wallbox.inProgress"), color: CHART.accent }]}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("wallbox.devTableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6 sm:pt-0">
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>{t("wallbox.colDate")}</TableHead>
                {columns.map((c) => (
                  <TableHead key={c.key} className="text-right">
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...history].reverse().map((h) => (
                <TableRow key={h.date}>
                  <TableCell className="font-medium">{formatIsoDate(h.date, locale)}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.key} className="text-right tabular-nums">
                      {fmtNum(h[c.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
