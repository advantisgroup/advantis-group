"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { InteractionsTable } from "@/components/performance/InteractionsTable";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function EmployeeInteractionsPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const token = getPerformanceToken() ?? "";
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.interactionsMonth, {
    token,
    employeeId,
    ym,
  });

  if (!data) return <PerformanceContentSkeleton />;

  return <InteractionsTable days={data.days} total={data.total} />;
}
