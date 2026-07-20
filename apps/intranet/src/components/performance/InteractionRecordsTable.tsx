"use client";

import { useTranslations } from "next-intl";

import { type InteractionTotal } from "@/components/performance/InteractionsTable";
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

export interface InteractionRecord {
  id: string;
  employeeName: string;
  startedAt: number;
  durationSec: number;
  direction: string | undefined;
}

/** Every individual interaction on one day — the drill-down behind an
 * `InteractionsTable` day row. `showEmployee` is on for the team-wide
 * (admin) view and off for an employee's own, already employee-scoped
 * view. */
export function InteractionRecordsTable({
  records,
  total,
  showEmployee,
}: {
  records: InteractionRecord[];
  total: InteractionTotal;
  showEmployee: boolean;
}) {
  const t = useTranslations("Performance");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("interactionsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("interactionsEmpty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {showEmployee && <TableHead>{t("colName")}</TableHead>}
                <TableHead>{t("colFrom")}</TableHead>
                <TableHead className="text-right">
                  {t("colTotalDuration")}
                </TableHead>
                <TableHead>{t("interactionDirection")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(r => (
                <TableRow key={r.id}>
                  {showEmployee && (
                    <TableCell className="font-medium">
                      {r.employeeName}
                    </TableCell>
                  )}
                  <TableCell className="tabular-nums">
                    {fmtTimeOfDay(r.startedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtDurationPrecise(r.durationSec)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.direction ?? "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell
                  className="font-semibold"
                  colSpan={showEmployee ? 2 : 1}
                >
                  {t("interactionsTotalRow")} · {fmtNum(total.count)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmtDurationPrecise(total.totalDurationSec)}
                </TableCell>
                <TableCell className="text-xs font-normal text-muted-foreground">
                  {t("interactionAvgInline", {
                    value: fmtDurationPrecise(total.avgDurationSec),
                  })}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
