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
  quickFlips: number;
}

/** Quick active↔idle flips per day — the "switching a lot" pattern as a bar. */
export function WeekSwitchesChart({
  data,
  seriesLabel,
}: {
  data: Datum[];
  seriesLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
          width={28}
          allowDecimals={false}
        />
        <Tooltip {...tooltipStyle} />
        <Bar
          dataKey="quickFlips"
          name={seriesLabel}
          fill={CHART.idle}
          maxBarSize={28}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
