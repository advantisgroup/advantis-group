"use client";

import { useDashboardData } from "@/components/performance/PerformanceDashboardContext";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { TeamTable } from "@/components/performance/TeamTable";

export default function DashboardTeamPage() {
  const data = useDashboardData();

  if (!data) return <PerformanceContentSkeleton />;

  return <TeamTable data={data} />;
}
