"use client";

import { useMemo, useState } from "react";

import { Clock, Phone, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART, tooltipStyle } from "@/components/charts/theme";
import { type InteractionTotal } from "@/components/performance/InteractionsTable";
import { MetricTile } from "@/components/performance/MetricTile";
import {
  fmtDurationPrecise,
  fmtNum,
  fmtTimeOfDay,
} from "@/components/performance/PerformanceFormat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nextSort, type Sort, SortableHead, sortSign } from "@/components/ui/sortable-head";
import {
  Table,
  TableBody,
  TableCell,
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

const ALL = "__all__";
const PAGE_SIZE = 50;
// Duration buckets in seconds — short/medium/long calls, a rough split
// useful for spotting drop-offs vs. genuinely worked interactions in a day
// with hundreds of rows.
const SHORT_MAX = 60;
const MEDIUM_MAX = 300;

type SortKey = "employeeName" | "startedAt" | "durationSec" | "direction";
type DurationFilter = "all" | "short" | "medium" | "long";

function durationBucket(sec: number): Exclude<DurationFilter, "all"> {
  if (sec < SHORT_MAX) return "short";
  if (sec < MEDIUM_MAX) return "medium";
  return "long";
}

/** Every individual interaction on one day — the drill-down behind an
 * `InteractionsTable` day row. A single day can carry hundreds of rows, so
 * this is filterable (employee search, direction, duration bucket),
 * sortable, paginated, and opens with an hour-of-day distribution instead
 * of dumping the whole list unfiltered. `showEmployee` is on for the
 * team-wide (admin) view and off for an employee's own, already
 * employee-scoped view. */
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
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<string>(ALL);
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all");
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "startedAt", dir: "asc" });
  const [page, setPage] = useState(0);

  const directions = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) if (r.direction) set.add(r.direction);
    return [...set].sort();
  }, [records]);

  const longestSec = useMemo(
    () => records.reduce((a, r) => Math.max(a, r.durationSec), 0),
    [records],
  );

  const filtered = useMemo(() => {
    let rows = records;
    if (showEmployee && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.employeeName.toLowerCase().includes(q));
    }
    if (direction !== ALL) {
      rows = rows.filter((r) => (r.direction ?? "") === direction);
    }
    if (durationFilter !== "all") {
      rows = rows.filter((r) => durationBucket(r.durationSec) === durationFilter);
    }
    return rows;
  }, [records, search, direction, durationFilter, showEmployee]);

  const sorted = useMemo(() => {
    const dir = sortSign(sort.dir);
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "employeeName":
          return dir * a.employeeName.localeCompare(b.employeeName);
        case "durationSec":
          return dir * (a.durationSec - b.durationSec);
        case "direction":
          return dir * (a.direction ?? "").localeCompare(b.direction ?? "");
        default:
          return dir * (a.startedAt - b.startedAt);
      }
    });
  }, [filtered, sort]);

  const hourly = useMemo(() => {
    const counts = new Array(24).fill(0) as number[];
    for (const r of filtered) counts[new Date(r.startedAt).getUTCHours()]++;
    return counts.map((count, hour) => ({
      hour: `${String(hour).padStart(2, "0")}`,
      count,
    }));
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page0 = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(page0 * PAGE_SIZE, page0 * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) => nextSort(s, key));
  }

  function resetPage() {
    setPage(0);
  }

  if (records.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("interactionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("interactionsEmpty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile icon={Phone} label={t("interactionsStatCount")} value={fmtNum(total.count)} />
        <MetricTile
          icon={Clock}
          label={t("colTotalDuration")}
          value={fmtDurationPrecise(total.totalDurationSec)}
        />
        <MetricTile
          icon={Timer}
          label={t("colAvgDuration")}
          value={fmtDurationPrecise(total.avgDurationSec)}
        />
        <MetricTile
          icon={Timer}
          label={t("interactionsStatLongest")}
          value={fmtDurationPrecise(longestSec)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("interactionsHourlyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="hour"
                stroke={CHART.axis}
                tickLine={false}
                axisLine={false}
                fontSize={10}
                interval={1}
              />
              <YAxis
                stroke={CHART.axis}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={28}
                allowDecimals={false}
              />
              <Tooltip {...tooltipStyle} />
              <Bar
                dataKey="count"
                name={t("interactionsTitle")}
                fill={CHART.active}
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">{t("interactionsTitle")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {showEmployee && (
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder={t("interactionsSearchPlaceholder")}
                className="h-9 w-full sm:w-48"
              />
            )}
            {directions.length > 0 && (
              <Select
                value={direction}
                onValueChange={(v) => {
                  setDirection(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("interactionsFilterAllDirections")}</SelectItem>
                  {directions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={durationFilter}
              onValueChange={(v) => {
                setDurationFilter(v as DurationFilter);
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("interactionsFilterDurationAll")}</SelectItem>
                <SelectItem value="short">{t("interactionsFilterDurationShort")}</SelectItem>
                <SelectItem value="medium">{t("interactionsFilterDurationMedium")}</SelectItem>
                <SelectItem value="long">{t("interactionsFilterDurationLong")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("interactionsNoMatch")}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {showEmployee && (
                      <SortableHead
                        label={t("colName")}
                        active={sort.key === "employeeName"}
                        dir={sort.dir}
                        onClick={() => toggleSort("employeeName")}
                      />
                    )}
                    <SortableHead
                      label={t("colFrom")}
                      active={sort.key === "startedAt"}
                      dir={sort.dir}
                      onClick={() => toggleSort("startedAt")}
                    />
                    <TableHead>{t("colTo")}</TableHead>
                    <SortableHead
                      label={t("colTotalDuration")}
                      active={sort.key === "durationSec"}
                      dir={sort.dir}
                      onClick={() => toggleSort("durationSec")}
                      className="text-right"
                    />
                    <SortableHead
                      label={t("interactionDirection")}
                      active={sort.key === "direction"}
                      dir={sort.dir}
                      onClick={() => toggleSort("direction")}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => (
                    <TableRow key={r.id}>
                      {showEmployee && (
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                      )}
                      <TableCell className="tabular-nums">{fmtTimeOfDay(r.startedAt)}</TableCell>
                      <TableCell className="tabular-nums">
                        {fmtTimeOfDay(r.startedAt + r.durationSec * 1000)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtDurationPrecise(r.durationSec)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.direction ?? "–"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {t("interactionsShowingCount", {
                    shown: pageRows.length,
                    total: sorted.length,
                  })}
                </span>
                {pageCount > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page0 === 0}
                    >
                      {t("paginationPrev")}
                    </Button>
                    <span>
                      {t("paginationPageOf", {
                        page: page0 + 1,
                        pages: pageCount,
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={page0 >= pageCount - 1}
                    >
                      {t("paginationNext")}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
