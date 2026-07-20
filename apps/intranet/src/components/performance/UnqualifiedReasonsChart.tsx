"use client";

import { useTranslations } from "next-intl";

import { fmtNum } from "@/components/performance/PerformanceFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Horizontal bar breakdown of "Unqualified" reasons, each bar scaled
 * relative to the largest reason's count — the reference dashboard's
 * `reason-bar` list, previously flattened here into plain "reason · count"
 * badges that lost the at-a-glance size comparison. `reasons` must already
 * be sorted descending by count (as `aggregateReasons` returns it), since
 * the first entry's count is used as the 100% reference. */
export function UnqualifiedReasonsChart({
  reasons,
}: {
  reasons: { reason: string; count: number }[];
}) {
  const t = useTranslations("Performance");

  if (reasons.length === 0) return null;

  const max = reasons[0].count || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboardUnqualified")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {reasons.map(r => (
          <div
            key={r.reason}
            className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[12rem_1fr_2.5rem]"
          >
            <span className="truncate text-muted-foreground">{r.reason}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
            <span className="text-right font-medium tabular-nums">
              {fmtNum(r.count)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
