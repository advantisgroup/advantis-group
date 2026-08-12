"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import { CHART } from "@/components/activity/charts/theme";

export function CategoryRadarChart({ points }: { points: { label: string; value: number }[] }) {
  if (points.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={points}>
        <PolarGrid stroke={CHART.grid} />
        <PolarAngleAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: CHART.axis, fontSize: 9 }} tickCount={5} />
        <Radar dataKey="value" stroke={CHART.active} fill={CHART.active} fillOpacity={0.15} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
