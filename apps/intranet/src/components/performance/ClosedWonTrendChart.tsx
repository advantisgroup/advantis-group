"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART, tooltipStyle } from "@/components/activity/charts/theme";
import {
  fmtDayShort,
  fmtNum,
} from "@/components/performance/PerformanceFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Daily closed-won development over the trailing 3 months — bars above the
 * period average render green, at-or-below render red, with a dashed
 * reference line at the average itself.
 */
export function ClosedWonTrendChart({
  days,
  avg,
}: {
  days: { date: string; won: number }[];
  avg: number;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();

  if (days.length === 0) return null;

  const data = days.map(d => ({
    label: fmtDayShort(d.date, locale),
    won: d.won,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("wonTrendTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data}
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
              width={28}
              allowDecimals={false}
            />
            <Tooltip {...tooltipStyle} />
            <ReferenceLine
              y={avg}
              stroke={CHART.axis}
              strokeDasharray="4 4"
              label={{
                value: t("wonTrendAvgLabel", { value: fmtNum(avg) }),
                position: "insideTopRight",
                fill: CHART.axis,
                fontSize: 11,
              }}
            />
            <Bar
              dataKey="won"
              name={t("dashboardMetricWon")}
              radius={[3, 3, 0, 0]}
            >
              {data.map(d => (
                <Cell
                  key={d.label}
                  fill={d.won > avg ? CHART.active : "var(--destructive)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("wonTrendFootnote")}
        </p>
      </CardContent>
    </Card>
  );
}
