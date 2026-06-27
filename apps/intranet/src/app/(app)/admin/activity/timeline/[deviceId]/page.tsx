"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Clock } from "lucide-react";
import { use } from "react";

import { api } from "@advantis/convex/api";
import { useLocale, useTranslations } from "next-intl";

import { DailyTrendChart } from "@/components/activity/DailyTrendChart";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { aggregateDailyTotals, dayRange } from "@/lib/activity/activity";
import { formatDuration } from "@/lib/activity/format";
import { formatDateTime } from "@/lib/format";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ActivityTimelinePage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = use(params);
  const t = useTranslations("Activity");
  const tc = useTranslations("Common");
  const locale = useLocale();

  const startDay = isoDaysAgo(6);
  const endDay = isoDaysAgo(0);

  const samples = useQuery(api.activity.stats.recentSamples, {
    deviceId,
    limit: 100,
  });
  const daily = useQuery(api.activity.stats.dailyRange, {
    deviceId,
    startDay,
    endDay,
  });

  const days = dayRange(startDay, endDay);
  const trend = daily
    ? aggregateDailyTotals(
        [{ deviceId, hostname: deviceId, personName: null, daily }],
        days
      )
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={t("title")}
        title={deviceId}
        icon={<Clock />}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/activity/devices">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("nav.devices")}
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          {daily === undefined ? (
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
          {samples === undefined ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {tc("loading")}
            </p>
          ) : samples.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {tc("empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("overview.lastSeen")}</TableHead>
                  <TableHead>{t("devices.user")}</TableHead>
                  <TableHead className="text-right">Idle</TableHead>
                  <TableHead className="text-right">
                    {t("people.active")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {samples.map(s => (
                  <TableRow key={s._id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(s.capturedAt, locale)}
                    </TableCell>
                    <TableCell>{s.windowsUser}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatDuration(s.idleMs / 1000)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={s.active ? "success" : "muted"}>
                        {s.active ? t("states.ACTIVE") : t("states.IDLE")}
                      </Badge>
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
