"use client";

import { useState } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

import { CHART, tooltipStyle } from "./theme";

export interface BarSeries {
  key: string;
  name: string;
  color: string;
}

/**
 * Grouped bar chart with a clickable legend that isolates one series at a
 * time. Dense day-by-day data (30+ bars, 2-3 series each) otherwise renders
 * every series at once with no way to tell them apart — clicking a legend
 * pill hides that series (click again to restore); the chart widens the
 * remaining bars and never lets every series end up hidden.
 */
export function FilterableBarChart({
  data,
  series,
  height = 280,
  yTickFormatter,
  tooltipFormatter,
}: {
  data: Record<string, string | number>[];
  series: BarSeries[];
  height?: number;
  yTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === series.length) return prev;
      return next;
    });
  }

  const visible = series.filter(s => !hidden.has(s.key));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {series.map(s => {
          const isHidden = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={!isHidden}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-transparent bg-muted px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/70",
                isHidden && "text-muted-foreground/50"
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: isHidden ? "var(--chart-axis)" : s.color,
                }}
              />
              {s.name}
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          barCategoryGap="12%"
          barGap={4}
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
            width={36}
            tickFormatter={yTickFormatter}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={
              tooltipFormatter
                ? (value: number) => tooltipFormatter(value)
                : undefined
            }
          />
          {visible.map(s => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              maxBarSize={visible.length === 1 ? 22 : 12}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
