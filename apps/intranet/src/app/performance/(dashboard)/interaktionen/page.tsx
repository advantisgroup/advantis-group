"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { InteractionsTable } from "@/components/performance/InteractionsTable";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { PeriodFilter } from "@/components/performance/PeriodFilter";
import {
  computePeriodRange,
  shiftAnchor,
  todayIso,
  type PeriodGranularity,
} from "@/components/performance/periodFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPerformanceToken } from "@/lib/performanceAuth";

const ALL_EMPLOYEES = "__all__";

export default function DashboardInteractionsPage() {
  const t = useTranslations("Performance");
  const token = getPerformanceToken() ?? "";
  const [granularity, setGranularity] = useState<PeriodGranularity>("month");
  const [anchor, setAnchor] = useState(todayIso);
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL_EMPLOYEES);
  const { start, end } = computePeriodRange(anchor, granularity);

  const data = useQuery(api.performanceQueries.interactionsMonth, {
    token,
    start,
    end,
  });

  const employees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of data?.days ?? []) {
      if (d.employeeId && d.employeeName)
        seen.set(d.employeeId, d.employeeName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.days]);

  const filtered = useMemo(() => {
    const days =
      employeeFilter === ALL_EMPLOYEES
        ? (data?.days ?? [])
        : (data?.days ?? []).filter(d => d.employeeId === employeeFilter);
    const total = days.reduce(
      (acc, d) => ({
        count: acc.count + d.count,
        totalDurationSec: acc.totalDurationSec + d.totalDurationSec,
      }),
      { count: 0, totalDurationSec: 0 }
    );
    return {
      days,
      total: {
        ...total,
        avgDurationSec: total.count
          ? Math.round(total.totalDurationSec / total.count)
          : 0,
      },
    };
  }, [data?.days, employeeFilter]);

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodFilter
          granularity={granularity}
          anchor={anchor}
          onGranularityChange={g => setGranularity(g)}
          onShift={dir => setAnchor(a => shiftAnchor(a, granularity, dir))}
        />
        {employees.length > 1 && (
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_EMPLOYEES}>
                {t("listEmpFilterAll")}
              </SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <InteractionsTable
        days={filtered.days}
        total={filtered.total}
        hrefForRow={row =>
          row.employeeId
            ? `/performance/mitarbeiter/${row.employeeId}/interaktionen/${row.date}`
            : `/performance/interaktionen/${row.date}`
        }
      />
    </div>
  );
}
