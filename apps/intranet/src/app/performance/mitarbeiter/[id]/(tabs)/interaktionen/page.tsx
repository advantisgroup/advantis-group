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

export default function EmployeeInteractionsPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id as Id<"performanceEmployees">;
  const latest = useQuery(api.performance.queries.latestInteractionDay, { employeeId });

  if (latest === undefined) return <PerformanceContentSkeleton />;
  // Opens on the newest day with data — today is usually still empty, the
  // export comes the next morning.
  return <DayView employeeId={employeeId} initial={latest ?? todayIso()} latest={latest} />;
}

function DayView({
  employeeId,
  initial,
  latest,
}: {
  employeeId: Id<"performanceEmployees">;
  initial: string;
  latest: string | null;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const [anchor, setAnchor] = useState(initial);

  const data = useQuery(api.performance.queries.interactionsDayDetail, {
    date: anchor,
    employeeId,
  });

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
        {latest && anchor !== latest && (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(latest)}>
            {t("interactionsLatestDay")}
          </Button>
        )}
      </div>

      {data ? (
        <InteractionRecordsTable records={data.records} total={data.total} showEmployee={false} />
      ) : (
        <PerformanceContentSkeleton />
      )}
    </div>
  );
}
