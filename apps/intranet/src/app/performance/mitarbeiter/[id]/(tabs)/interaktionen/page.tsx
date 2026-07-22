"use client";

import { useState } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { InteractionsTable } from "@/components/performance/InteractionsTable";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { PeriodFilter } from "@/components/performance/PeriodFilter";
import {
  computePeriodRange,
  shiftAnchor,
  todayIso,
  type PeriodGranularity,
} from "@/components/performance/periodFilter";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function EmployeeInteractionsPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const token = getPerformanceToken() ?? "";
  const [granularity, setGranularity] = useState<PeriodGranularity>("month");
  const [anchor, setAnchor] = useState(todayIso);
  const { start, end } = computePeriodRange(anchor, granularity);

  const data = useQuery(api.performanceQueries.interactionsMonth, {
    token,
    employeeId,
    start,
    end,
  });

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <div className="space-y-4">
      <PeriodFilter
        granularity={granularity}
        anchor={anchor}
        onGranularityChange={g => setGranularity(g)}
        onShift={dir => setAnchor(a => shiftAnchor(a, granularity, dir))}
      />

      <InteractionsTable
        days={data.days}
        total={data.total}
        hrefForRow={row =>
          `/performance/mitarbeiter/${employeeId}/interaktionen/${row.date}`
        }
      />
    </div>
  );
}
