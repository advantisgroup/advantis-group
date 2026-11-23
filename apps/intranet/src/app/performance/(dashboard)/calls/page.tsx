"use client";

import { CallInteractions } from "@/components/performance/CallInteractions";
import { CallsTab } from "@/components/performance/CallsTab";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { useDashboardData } from "@/components/performance/PerformanceDashboardContext";

export default function DashboardCallsPage() {
  const data = useDashboardData();
  const companyId = usePerformanceAccess().dashboard?.companyId;
  return (
    <CallsTab
      data={data}
      totals={data?.total}
      statsGridClassName="grid-cols-1"
      interactions={
        companyId && <CallInteractions ym={data?.ym} scope={{ kind: "team", companyId }} />
      }
    />
  );
}
