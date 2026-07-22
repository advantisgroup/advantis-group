"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { formatIsoDate } from "@/lib/format";

import { fmtDuration, fmtNum } from "./PerformanceFormat";

export interface LastDayInteractionRow {
  date: string;
  count: number;
  avgDurationSec: number;
  totalDurationSec: number;
  employeeId?: string;
  employeeName?: string;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Stacked full-width rows rather than side-by-side columns — three
 * differently-long labels ("Interaktionen" vs. "Gesamt Gesprächszeit")
 * wrap to a different number of lines when cramped into a shared row,
 * which misaligned each column's value against its neighbors. */
function RowStats({ row }: { row: LastDayInteractionRow }) {
  const t = useTranslations("Performance");
  return (
    <div className="flex flex-col gap-1">
      <StatRow label={t("interactionsStatCount")} value={fmtNum(row.count)} />
      <StatRow
        label={t("callsAvgDurationLabel")}
        value={fmtDuration(row.avgDurationSec)}
      />
      <StatRow
        label={t("callsTotalTalkLabel")}
        value={fmtDuration(row.totalDurationSec)}
      />
    </div>
  );
}

/** Replaces the closed-won trend chart at the top of the Interaktionen tab:
 * always the most recent day with any interactions, broken out per employee
 * on the team dashboard (rows carry `employeeName` there — see
 * `interactionsMonth`'s team-wide shape) or a single stat set on the
 * employee view (rows never carry `employeeName` there). */
export function LastDayInteractions({
  days,
  locale,
}: {
  days: LastDayInteractionRow[];
  locale: string;
}) {
  const t = useTranslations("Performance");
  const withData = days.filter(d => d.count > 0);
  if (withData.length === 0) return null;

  const lastDate = withData.reduce(
    (max, d) => (d.date > max ? d.date : max),
    withData[0].date
  );
  const rows = withData.filter(d => d.date === lastDate);
  const isTeam = rows.some(r => r.employeeName !== undefined);
  const title = t("lastDayInteractionsTitle", {
    date: formatIsoDate(lastDate, locale),
  });

  if (!isTeam) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <RowStats row={rows[0]} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(row => (
            <div
              key={row.employeeId ?? row.employeeName}
              className="flex flex-col gap-2 rounded-md border border-border/60 p-3"
            >
              <span className="text-xs font-medium">{row.employeeName}</span>
              <RowStats row={row} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
