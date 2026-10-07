"use client";

import { useState } from "react";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { InteractionRecordsTable } from "@/components/performance/InteractionRecordsTable";
import { shiftAnchor, todayIso } from "@/components/performance/lib";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Button } from "@/components/ui/button";
import { formatIsoDate } from "@/lib/format";
import { getPerformanceToken } from "@/lib/performanceAuth";

export default function EmployeeInteractionsPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const token = getPerformanceToken() ?? "";
  const [anchor, setAnchor] = useState(todayIso);

  const data = useQuery(api.performance.queries.interactionsDayDetail, {
    token,
    date: anchor,
    employeeId,
  });

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title={t("paginationPrev")}
          onClick={() => setAnchor((a) => shiftAnchor(a, "day", -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium tabular-nums">
          {formatIsoDate(anchor, locale)}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title={t("paginationNext")}
          onClick={() => setAnchor((a) => shiftAnchor(a, "day", 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {anchor !== todayIso() && (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(todayIso())}>
            {t("today")}
          </Button>
        )}
      </div>

      <InteractionRecordsTable records={data.records} total={data.total} showEmployee={false} />
    </div>
  );
}
