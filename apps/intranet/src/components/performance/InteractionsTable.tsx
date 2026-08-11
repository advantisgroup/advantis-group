"use client";

import { useRouter } from "next/navigation";

import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  fmtDurationPrecise,
  fmtNum,
  fmtTimeOfDay,
} from "@/components/performance/PerformanceFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/format";

export interface InteractionDay {
  date: string;
  from: number;
  to: number;
  count: number;
  totalDurationSec: number;
  avgDurationSec: number;
  // Only set team-wide — one row per employee per day rather than one
  // summed row per day for the whole team.
  employeeId?: string;
  employeeName?: string;
}

export interface InteractionTotal {
  count: number;
  totalDurationSec: number;
  avgDurationSec: number;
}

/** First/last interaction, count, total and average duration per employee
 * per day for a month, with a grand-total row — shared by the dashboard's
 * (team-wide, one row per employee per day) and the employee detail's (one
 * row per day, already scoped to that employee) "Interaktionen" tab. */
export function InteractionsTable({
  days,
  total,
  hrefForRow,
}: {
  days: InteractionDay[];
  total: InteractionTotal;
  /** Rows navigate to this day's (and, team-wide, this employee's)
   * individual interactions when set. */
  hrefForRow?: (row: InteractionDay) => string;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const showEmployee = days.some((d) => d.employeeName !== undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("interactionsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("interactionsEmpty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colDate")}</TableHead>
                {showEmployee && <TableHead>{t("colName")}</TableHead>}
                <TableHead>{t("colFrom")}</TableHead>
                <TableHead>{t("colTo")}</TableHead>
                <TableHead className="text-right">{t("colCount")}</TableHead>
                <TableHead className="text-right">{t("colTotalDuration")}</TableHead>
                <TableHead className="text-right">{t("colAvgDuration")}</TableHead>
                {hrefForRow && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((d) => (
                <TableRow
                  key={`${d.employeeId ?? ""}\n${d.date}`}
                  className={hrefForRow ? "cursor-pointer hover:bg-muted/50" : undefined}
                  onClick={hrefForRow ? () => router.push(hrefForRow(d)) : undefined}
                >
                  <TableCell className="font-medium">{formatIsoDate(d.date, locale)}</TableCell>
                  {showEmployee && <TableCell>{d.employeeName ?? "–"}</TableCell>}
                  <TableCell className="tabular-nums">{fmtTimeOfDay(d.from)}</TableCell>
                  <TableCell className="tabular-nums">{fmtTimeOfDay(d.to)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(d.count)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtDurationPrecise(d.totalDurationSec)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtDurationPrecise(d.avgDurationSec)}
                  </TableCell>
                  {hrefForRow && (
                    <TableCell className="w-8">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">{t("interactionsTotalRow")}</TableCell>
                {showEmployee && <TableCell />}
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmtNum(total.count)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmtDurationPrecise(total.totalDurationSec)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmtDurationPrecise(total.avgDurationSec)}
                </TableCell>
                {hrefForRow && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
