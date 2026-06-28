"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  STATE_NAMES,
  type HourStateBucket,
  type StateName,
} from "@/lib/activity/activity";
import { CHART, STATE_COLOR, tooltipStyle } from "./theme";

/**
 * Stacked minutes-per-state by hour of day. Sits below the hour heatmap on the
 * device timeline and shows *what* the person was doing each hour — idle, on a
 * call, on break, wrap-up — not just whether they were active.
 */
export function HourlyStateChart({
  data,
  labels,
}: {
  data: HourStateBucket[];
  /** Localised label per state name, for legend/tooltip. */
  labels: Record<StateName, string>;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="hour"
          stroke={CHART.axis}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          interval={1}
          tickFormatter={(h: number) => String(h).padStart(2, "0")}
        />
        <YAxis
          stroke={CHART.axis}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={36}
          unit="m"
        />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={h => `${String(h).padStart(2, "0")}:00`}
        />
        {STATE_NAMES.map((state, i) => (
          <Bar
            key={state}
            dataKey={state}
            name={labels[state]}
            stackId="s"
            fill={STATE_COLOR[state]}
            maxBarSize={22}
            radius={i === STATE_NAMES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
