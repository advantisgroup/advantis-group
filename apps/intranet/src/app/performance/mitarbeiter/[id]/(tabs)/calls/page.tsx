"use client";

import { CallsTab } from "@/components/performance/CallsTab";
import { useEmployeeDetailData } from "@/components/performance/PerformanceEmployeeDetailContext";

export default function EmployeeCallsPage() {
  const data = useEmployeeDetailData();
  return <CallsTab data={data} totals={data?.cur ?? undefined} statsGridClassName="grid-cols-2" />;
}
