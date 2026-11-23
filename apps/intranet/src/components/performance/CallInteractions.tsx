"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { type InteractionDay, InteractionsTable } from "@/components/performance/InteractionsTable";
import { LastDayInteractions } from "@/components/performance/LastDayInteractions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_EMPLOYEES = "__all__";

/** The Interaktionen export's part of the Calls tab (it used to be a tab of
 * its own): the last day per person, then first/last interaction, count and
 * durations per day for the month the page's month picker shows. Rows open
 * that day's single interactions. */
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

  const filtered = useMemo(() => {
    const days: InteractionDay[] =
      employeeFilter === ALL_EMPLOYEES
        ? (data?.days ?? [])
        : (data?.days ?? []).filter((d) => d.employeeId === employeeFilter);
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
  }, [data?.days, employeeFilter]);

  if (!data) return null;

  const hrefForRow = (row: InteractionDay) =>
    scope.kind === "employee"
      ? `/performance/mitarbeiter/${scope.employeeId}/interaktionen/${row.date}`
      : row.employeeId
        ? `/performance/mitarbeiter/${row.employeeId}/interaktionen/${row.date}`
        : `/performance/interaktionen/${row.date}`;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("interactionsTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("callsInteractionsHint")}</p>
        </div>
        {employees.length > 1 && (
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-56">
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
      <LastDayInteractions days={filtered.days} locale={locale} />
      <InteractionsTable days={filtered.days} total={filtered.total} hrefForRow={hrefForRow} />
    </section>
  );
}
