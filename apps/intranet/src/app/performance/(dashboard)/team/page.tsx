"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { TeamTable } from "@/components/performance/TeamTable";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function DashboardTeamPage() {
  const token = getPerformanceToken() ?? "";
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.teamDashboard, { token, ym });

  if (!data) return <PerformanceContentSkeleton />;

  return <TeamTable data={data} />;
}
