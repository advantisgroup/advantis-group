"use client";

import { CallsTab } from "@/components/performance/CallsTab";
import { useDashboardData } from "@/components/performance/PerformanceDashboardContext";

export default function DashboardCallsPage() {
  const data = useDashboardData();
  return <CallsTab data={data} totals={data?.total} statsGridClassName="grid-cols-1" />;
}
