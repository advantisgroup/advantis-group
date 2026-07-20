"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { InteractionsTable } from "@/components/performance/InteractionsTable";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function DashboardInteractionsPage() {
  const token = getPerformanceToken() ?? "";
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.interactionsMonth, {
    token,
    ym,
  });

  if (!data) return <PerformanceContentSkeleton />;

  return <InteractionsTable days={data.days} total={data.total} />;
}
