"use client";

import { useQuery } from "convex/react";
import { FileBarChart } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";

import { DailyTrendChart } from "@/components/activity/DailyTrendChart";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  aggregateDailyTotals,
  aggregatePerDevice,
  dayRange,
} from "@/lib/activity/activity";
import { formatDuration } from "@/lib/activity/format";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ActivityReportsPage() {
  const t = useTranslations("Activity");
  const tc = useTranslations("Common");

  const [startDay, setStartDay] = useState(() => isoDaysAgo(6));
  const [endDay, setEndDay] = useState(() => isoDaysAgo(0));

  const rows = useQuery(api.activity.reports.weeklyOverview, {
    startDay,
    endDay,
  });

  const days = useMemo(() => dayRange(startDay, endDay), [startDay, endDay]);
  const trend = useMemo(
    () => (rows ? aggregateDailyTotals(rows, days) : []),
    [rows, days]
  );
  const perDevice = useMemo(
    () => (rows ? aggregatePerDevice(rows) : []),
    [rows]
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={t("title")}
        title={t("reports.title")}
        icon={<FileBarChart />}
        action={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDay}
              onChange={e => setStartDay(e.target.value)}
              className="h-9 w-40"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              value={endDay}
              onChange={e => setEndDay(e.target.value)}
              className="h-9 w-40"
            />
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          {rows === undefined ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tc("loading")}
            </p>
          ) : (
            <DailyTrendChart data={trend} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows && perDevice.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("reports.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports.device")}</TableHead>
                  <TableHead>{t("reports.person")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports.active")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports.idle")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perDevice.map(r => (
                  <TableRow key={r.deviceId}>
                    <TableCell className="font-medium">{r.hostname}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.personName ?? tc("none")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(r.activeSeconds)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatDuration(r.idleSeconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
