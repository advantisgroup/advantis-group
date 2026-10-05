"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART, tooltipStyle } from "@/components/charts/theme";

export function SkillLineChart({ points }: { points: { label: string; score: number }[] }) {
  if (points.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          width={30}
          domain={[0, 100]}
        />
        <Tooltip {...tooltipStyle} />
        <Line
          type="monotone"
          dataKey="score"
          stroke={CHART.active}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART.active }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
