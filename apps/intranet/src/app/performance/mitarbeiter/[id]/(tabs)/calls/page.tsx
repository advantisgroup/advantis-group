"use client";

import { useParams } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";

import { CallInteractions } from "@/components/performance/CallInteractions";
import { CallsTab } from "@/components/performance/CallsTab";
import { useEmployeeDetailData } from "@/components/performance/PerformanceEmployeeDetailContext";

export default function EmployeeCallsPage() {
  const data = useEmployeeDetailData();
  const employeeId = useParams<{ id: string }>().id as Id<"performanceEmployees">;
  return (
    <CallsTab
      data={data}
      totals={data?.cur ?? undefined}
      statsGridClassName="grid-cols-2"
      interactions={<CallInteractions ym={data?.ym} scope={{ kind: "employee", employeeId }} />}
    />
  );
}
