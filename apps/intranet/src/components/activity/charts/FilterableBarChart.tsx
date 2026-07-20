"use client";

import { useMemo, useState } from "react";

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

// D3's log scale can't place exactly 0 anywhere on the axis — floor a true
// zero to a hair above it purely so the bar still plots, without touching
// any other value. The tooltip looks the real value back up via this
// suffix rather than showing the floor.
const LOG_FLOOR = 0.5;
const RAW_SUFFIX = "__raw";

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
  yScale = "linear",
}: {
  data: Record<string, string | number>[];
  series: BarSeries[];
  height?: number;
  yTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
  /** "log" compresses the axis so a handful of extreme outlier days (e.g.
   * one mis-tagged report inflating a single day's total by orders of
   * magnitude) don't flatten every other day's bar down to an invisible
   * sliver — nothing in the underlying data is filtered, capped, or
   * otherwise changed, only the axis scale. A log scale has no
   * representation for exactly 0, so zero-valued points are floored to a
   * hair above it purely for plotting; real values are untouched. */
  yScale?: "linear" | "log";
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

  const chartData = useMemo(() => {
    if (yScale !== "log") return data;
    return data.map(row => {
      const next: Record<string, string | number> = { ...row };
      for (const s of series) {
        const v = row[s.key];
        if (typeof v === "number") {
          next[`${s.key}${RAW_SUFFIX}`] = v;
          if (v <= 0) next[s.key] = LOG_FLOOR;
        }
      }
      return next;
    });
  }, [data, series, yScale]);

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
          data={chartData}
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
            {...(yScale === "log"
              ? {
                  scale: "log" as const,
                  domain: [LOG_FLOOR, "auto"],
                  allowDataOverflow: true,
                }
              : undefined)}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={
              tooltipFormatter
                ? (
                    value: number,
                    _name: string,
                    item: { dataKey?: string | number; payload?: unknown }
                  ) => {
                    const raw =
                      yScale === "log" &&
                      typeof item.dataKey === "string" &&
                      item.payload &&
                      typeof item.payload === "object"
                        ? (item.payload as Record<string, unknown>)[
                            `${item.dataKey}${RAW_SUFFIX}`
                          ]
                        : undefined;
                    return tooltipFormatter(
                      typeof raw === "number" ? raw : value
                    );
                  }
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
