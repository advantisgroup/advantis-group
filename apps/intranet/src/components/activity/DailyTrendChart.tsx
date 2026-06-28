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

/**
 * Stacked active/idle hours trend. Themed entirely via the intranet's OKLCH CSS
 * variables (advantis red `--primary` for active, muted for idle) rather than
 * ActivityTrack's blue accent.
 */
export function DailyTrendChart({
  data,
}: {
  data: { day: string; activeHours: number; idleHours: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
              <stop
                offset="100%"
                stopColor="var(--primary)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius, 0.5rem)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="activeHours"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#activeFill)"
          />
          <Area
            type="monotone"
            dataKey="idleHours"
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            fill="var(--muted)"
            fillOpacity={0.3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
