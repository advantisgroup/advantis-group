"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  fmtDuration,
  fmtDurationPrecise,
  fmtNum,
} from "@/components/performance/PerformanceFormat";
import { type TeamDashboardData } from "@/components/performance/TeamTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { nextSort, type Sort, SortableHead } from "@/components/ui/sortable-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  employeeId: string;
  name: string;
  loginDays?: number;
  loginSec?: number;
  loginPerDay?: number;
  callsToday?: number;
  callsAnswered?: number;
  callsOutbound?: number;
  talkTotalSec?: number;
  talkAvgSec?: number;
};

type Key = Exclude<keyof Row, "employeeId">;

const COLUMNS: { key: Key; label: string; render: (r: Row) => string }[] = [
  { key: "loginDays", label: "colLoginDays", render: (r) => fmtNum(r.loginDays) },
  { key: "loginSec", label: "colLoginTotal", render: (r) => fmtDuration(r.loginSec) },
  { key: "loginPerDay", label: "colLoginPerDay", render: (r) => fmtDuration(r.loginPerDay) },
  { key: "callsToday", label: "colCalls", render: (r) => fmtNum(r.callsToday) },
  { key: "callsAnswered", label: "colCallsAnswered", render: (r) => fmtNum(r.callsAnswered) },
  { key: "callsOutbound", label: "colCallsOutbound", render: (r) => fmtNum(r.callsOutbound) },
  { key: "talkTotalSec", label: "colTalkTotal", render: (r) => fmtDuration(r.talkTotalSec) },
  { key: "talkAvgSec", label: "colTalkAvg", render: (r) => fmtDurationPrecise(r.talkAvgSec) },
];

/** The Team tab: what each person did on the phone this month (Genesys) —
 * the sales KPIs are already in the Überblick table. */
export function TeamActivityTable({ data }: { data: TeamDashboardData }) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const [sort, setSort] = useState<Sort<Key>>({ key: "name", dir: "asc" });

  const rows = useMemo(() => {
    const out: Row[] = data.snaps.map((s) => ({
      employeeId: s.employeeId,
      name: s.name,
      loginDays: s.loginDays,
      loginSec: s.loginSec,
      loginPerDay: s.loginSec && s.loginDays ? Math.round(s.loginSec / s.loginDays) : undefined,
      callsToday: s.callsToday,
      callsAnswered: s.callsAnswered,
      callsOutbound: s.callsOutbound,
      talkTotalSec: s.talkTotalSec,
      talkAvgSec: s.talkAvgSec,
    }));
    return out.sort((a, b) => {
      const cmp =
        sort.key === "name"
          ? a.name.localeCompare(b.name)
          : (a[sort.key] ?? -Infinity) - (b[sort.key] ?? -Infinity);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data.snaps, sort]);

  const toggle = (key: Key) =>
    setSort((prev) => nextSort(prev, key, key === "name" ? "asc" : "desc"));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="text-base">{t("teamActivityTitle")}</CardTitle>
        <InfoTip text={t("teamActivityHint")} />
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:p-6 sm:pt-0">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <SortableHead
                label={t("colName")}
                active={sort.key === "name"}
                dir={sort.dir}
                onClick={() => toggle("name")}
              />
              {COLUMNS.map((c) => (
                <SortableHead
                  key={c.key}
                  label={t(c.label)}
                  active={sort.key === c.key}
                  dir={sort.dir}
                  onClick={() => toggle(c.key)}
                  className="text-right"
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.employeeId}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/performance/mitarbeiter/${r.employeeId}/calls`)}
              >
                <TableCell className="font-medium">
                  <Link
                    href={`/performance/mitarbeiter/${r.employeeId}/calls`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                  >
                    {r.name}
                  </Link>
                </TableCell>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {c.render(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
