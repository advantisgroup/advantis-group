"use client";

import { useDashboardData } from "@/components/performance/PerformanceDashboardContext";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { TeamActivityTable } from "@/components/performance/TeamActivityTable";

export default function DashboardTeamPage() {
  const data = useDashboardData();

  if (!data) return <PerformanceContentSkeleton />;

  return <TeamActivityTable data={data} />;
}
