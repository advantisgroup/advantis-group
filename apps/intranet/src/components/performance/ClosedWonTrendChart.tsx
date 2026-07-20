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

/** Renders the average reference line's label as a solid pill anchored to
 * the line's own (x, y) via Recharts' `viewBox` — not a fixed chart corner
 * like `position: "insideTopRight"`, which drifted away from the line
 * whenever the average sat somewhere other than the very top of the chart,
 * and used the same low-contrast axis color as the gridlines, making both
 * the line and the label hard to spot against the bars. */
function makeAvgLabel(text: string) {
  return function AvgRefLabel({
    viewBox,
  }: {
    viewBox?: { x?: number; y?: number; width?: number };
  }) {
    const width = 84;
    const height = 20;
    const lineY = viewBox?.y ?? 0;
    const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) - width - 2;
    // Flip below the line when there isn't enough headroom above it (the
    // average sitting near the top of the chart), so the pill never clips.
    const y = lineY > height + 8 ? lineY - height - 6 : lineY + 6;
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={4}
          fill="var(--chart-panel)"
          stroke="var(--chart-fg)"
          strokeOpacity={0.4}
        />
        <text
          x={x + width / 2}
          y={y + height / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--chart-fg)"
        >
          {text}
        </text>
      </g>
    );
  };
}

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
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
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
              width={34}
              allowDecimals={false}
            />
            <Tooltip {...tooltipStyle} />
            <Bar
              dataKey="won"
              name={t("dashboardMetricWon")}
              fill={CHART.active}
              radius={[3, 3, 0, 0]}
            >
              {data.map(d => (
                <Cell
                  key={d.label}
                  fill={d.won > avg ? CHART.active : "var(--destructive)"}
                />
              ))}
            </Bar>
            {/* Declared after Bar so it paints on top — SVG stacks by
                document order, and a line declared before the bars was
                getting covered by every bar taller than the average. */}
            <ReferenceLine
              y={avg}
              stroke="var(--chart-fg)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              label={makeAvgLabel(
                t("wonTrendAvgLabel", { value: fmtNum(avg) })
              )}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("wonTrendFootnote")}
        </p>
      </CardContent>
    </Card>
  );
}
