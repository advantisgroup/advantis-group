"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, tooltipStyle } from "./theme";

interface Datum {
  label: string;
  activePct: number;
}

/** Percent-active through the day as a smooth area chart. */
export function IntradayChart({
  data,
  seriesLabel,
}: {
  data: Datum[];
  seriesLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.5} />
            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="label"
          stroke={CHART.axis}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          minTickGap={24}
        />
        <YAxis
          stroke={CHART.axis}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={36}
          unit="%"
          domain={[0, 100]}
        />
        <Tooltip {...tooltipStyle} />
        <Area
          type="monotone"
          dataKey="activePct"
          name={seriesLabel}
          stroke={CHART.accent}
          strokeWidth={2}
          fill="url(#activeFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
