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
import { CHART, tooltipStyle } from "./theme";

interface Datum {
  label: string;
  activeHours: number;
  idleHours: number;
}

/** Stacked active-vs-idle hours per day over a date range. */
export function DailyTrendChart({
  data,
  activeLabel,
  idleLabel,
}: {
  data: Datum[];
  activeLabel: string;
  idleLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
          unit="h"
        />
        <Tooltip {...tooltipStyle} />
        <Bar
          dataKey="activeHours"
          name={activeLabel}
          stackId="a"
          fill={CHART.active}
          maxBarSize={28}
          radius={[0, 0, 4, 4]}
        />
        <Bar
          dataKey="idleHours"
          name={idleLabel}
          stackId="a"
          fill={CHART.idle}
          maxBarSize={28}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
