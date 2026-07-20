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
}

export interface InteractionTotal {
  count: number;
  totalDurationSec: number;
  avgDurationSec: number;
}

/** First/last interaction, count, total and average duration per day for a
 * month, with a grand-total row — shared by the dashboard's and the
 * employee detail's "Interaktionen" tab. */
export function InteractionsTable({
  days,
  total,
  hrefForDate,
}: {
  days: InteractionDay[];
  total: InteractionTotal;
  /** Day rows navigate to this day's individual interactions when set. */
  hrefForDate?: (date: string) => string;
}) {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("interactionsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("interactionsEmpty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colDate")}</TableHead>
                <TableHead>{t("colFrom")}</TableHead>
                <TableHead>{t("colTo")}</TableHead>
                <TableHead className="text-right">{t("colCount")}</TableHead>
                <TableHead className="text-right">
                  {t("colTotalDuration")}
                </TableHead>
                <TableHead className="text-right">
                  {t("colAvgDuration")}
                </TableHead>
                {hrefForDate && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map(d => (
                <TableRow
                  key={d.date}
                  className={
                    hrefForDate ? "cursor-pointer hover:bg-muted/50" : undefined
                  }
                  onClick={
                    hrefForDate
                      ? () => router.push(hrefForDate(d.date))
                      : undefined
                  }
                >
                  <TableCell className="font-medium">
                    {formatIsoDate(d.date, locale)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {fmtTimeOfDay(d.from)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {fmtTimeOfDay(d.to)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(d.count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtDurationPrecise(d.totalDurationSec)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtDurationPrecise(d.avgDurationSec)}
                  </TableCell>
                  {hrefForDate && (
                    <TableCell className="w-8">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">
                  {t("interactionsTotalRow")}
                </TableCell>
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
                {hrefForDate && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
