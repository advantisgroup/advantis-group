"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { type InteractionDay, InteractionsTable } from "@/components/performance/InteractionsTable";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatIsoDate } from "@/lib/format";

const ALL_EMPLOYEES = "__all__";

type Mode = "day" | "month";

/** The Interaktionen export's part of the Calls tab (it used to be a tab of
 * its own): first/last interaction, count and durations per person and day.
 * Opens on the newest day with data (the last upload), with arrows through
 * the month's days and a switch to the whole month — the month itself comes
 * from the page's month picker. Rows open that day's single interactions. */
export function CallInteractions({
  ym,
  scope,
}: {
  ym: string | undefined;
  scope:
    | { kind: "team"; companyId: Id<"companies"> }
    | { kind: "employee"; employeeId: Id<"performanceEmployees"> };
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL_EMPLOYEES);
  const [mode, setMode] = useState<Mode>("day");
  // The picked day, remembered per month so a month switch starts fresh.
  const [picked, setPicked] = useState<{ ym: string; date: string } | null>(null);

  const data = useQuery(
    api.performance.queries.interactionsMonth,
    !ym
      ? "skip"
      : scope.kind === "team"
        ? { companyId: scope.companyId, ym }
        : { employeeId: scope.employeeId, ym },
  );

  const employees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of data?.days ?? []) {
      if (d.employeeId && d.employeeName) seen.set(d.employeeId, d.employeeName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [data?.days, locale]);

  const byEmployee: InteractionDay[] = useMemo(
    () =>
      employeeFilter === ALL_EMPLOYEES
        ? (data?.days ?? [])
        : (data?.days ?? []).filter((d) => d.employeeId === employeeFilter),
    [data?.days, employeeFilter],
  );

  // Days with data, oldest first; the shown day falls back to the newest.
  const dates = useMemo(() => [...new Set(byEmployee.map((d) => d.date))].sort(), [byEmployee]);
  const latest = dates.at(-1) ?? null;
  const day = picked && picked.ym === ym && dates.includes(picked.date) ? picked.date : latest;
  const dayIdx = day ? dates.indexOf(day) : -1;

  const shown = useMemo(() => {
    const days = mode === "day" ? byEmployee.filter((d) => d.date === day) : byEmployee;
    const count = days.reduce((a, d) => a + d.count, 0);
    const totalDurationSec = days.reduce((a, d) => a + d.totalDurationSec, 0);
    return {
      days,
      total: {
        count,
        totalDurationSec,
        avgDurationSec: count ? Math.round(totalDurationSec / count) : 0,
      },
    };
  }, [byEmployee, mode, day]);

  if (!data || !ym) return null;

  const goTo = (date: string | undefined) => date && setPicked({ ym, date });
  const hrefForRow = (row: InteractionDay) =>
    scope.kind === "employee"
      ? `/performance/mitarbeiter/${scope.employeeId}/interaktionen/${row.date}`
      : row.employeeId
        ? `/performance/mitarbeiter/${row.employeeId}/interaktionen/${row.date}`
        : `/performance/interaktionen/${row.date}`;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="h-9">
            <TabsTrigger value="day">{t("periodFilterDay")}</TabsTrigger>
            <TabsTrigger value="month">{t("periodFilterMonth")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "day" && day && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title={t("paginationPrev")}
              disabled={dayIdx <= 0}
              onClick={() => goTo(dates[dayIdx - 1])}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-28 text-center text-sm font-medium tabular-nums">
              {formatIsoDate(day, locale)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title={t("paginationNext")}
              disabled={dayIdx >= dates.length - 1}
              onClick={() => goTo(dates[dayIdx + 1])}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {day !== latest && (
              <Button variant="ghost" size="sm" onClick={() => goTo(latest ?? undefined)}>
                {t("interactionsLatestDay")}
              </Button>
            )}
          </div>
        )}

        {scope.kind === "team" && employees.length > 0 && (
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="ml-auto w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_EMPLOYEES}>{t("listEmpFilterAll")}</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <InteractionsTable days={shown.days} total={shown.total} hrefForRow={hrefForRow} />
    </section>
  );
}
