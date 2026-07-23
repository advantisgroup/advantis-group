"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { type api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type TeamDashboardData = FunctionReturnType<
  typeof api.performanceQueries.teamDashboard
>;

const BADGE_ICONS: Record<string, string> = {
  hitrate: "🎯",
  won: "🏆",
  calls: "📞",
};

type SortKey =
  | "name"
  | "leadsCreated"
  | "workableCreated"
  | "workableRate"
  | "hitrate"
  | "wonMonth"
  | "wonPerDay"
  | "fc1"
  | "oppsOpen"
  | "overduesAnalysis"
  | "overduesOpps"
  | "oppsOver30"
  | "leadsNoAction14"
  | "oppsNoAction14";

const SORT_KEYS: SortKey[] = [
  "name",
  "leadsCreated",
  "workableCreated",
  "workableRate",
  "hitrate",
  "wonMonth",
  "wonPerDay",
  "fc1",
  "oppsOpen",
  "overduesAnalysis",
  "overduesOpps",
  "oppsOver30",
  "leadsNoAction14",
  "oppsNoAction14",
];
const SORT_STORAGE_KEY = "performance_team_sort";

function loadTeamSort(): { key: SortKey; dir: "asc" | "desc" } {
  const fallback = { key: "name" as const, dir: "asc" as const };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { key?: string; dir?: string };
    if (
      SORT_KEYS.includes(parsed.key as SortKey) &&
      (parsed.dir === "asc" || parsed.dir === "desc")
    ) {
      return { key: parsed.key as SortKey, dir: parsed.dir };
    }
  } catch {
    // Malformed/foreign localStorage value — fall back silently.
  }
  return fallback;
}

function SortableHead({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
        {active &&
          (dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  );
}

/** Searchable, sortable table of every employee in the report — shared by
 * the dedicated Team tab and the bottom of the dashboard's Overview tab, so
 * an admin can click into any employee from either without switching tabs
 * (the reference dashboard's "Mitarbeiter im Überblick" panel). */
export function TeamTable({ data }: { data: TeamDashboardData }) {
  const t = useTranslations("Performance");
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>(() =>
    loadTeamSort()
  );

  function toggleSort(key: SortKey) {
    setSort(prev => {
      const dir: "asc" | "desc" =
        prev.key === key
          ? prev.dir === "asc"
            ? "desc"
            : "asc"
          : key === "name"
            ? "asc"
            : "desc";
      const next = { key, dir };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  const visibleSnaps = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = q
      ? data.snaps.filter(s => s.name.toLowerCase().includes(q))
      : data.snaps;
    rows = [...rows].sort((a, b) => {
      const cmp =
        sort.key === "name"
          ? a.name.localeCompare(b.name)
          : (a[sort.key] ?? -Infinity) - (b[sort.key] ?? -Infinity);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data.snaps, search, sort]);

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <CardTitle className="text-base">{t("dashboardEmployees")}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {t("dashboardShownCount", {
              shown: visibleSnaps.length,
              total: data.snaps.length,
            })}
          </span>
        </div>
        <div className="relative w-full sm:max-w-[16rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("dashboardSearchPlaceholder")}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <SortableHead
                label={t("colName")}
                sortKey="name"
                active={sort.key === "name"}
                dir={sort.dir}
                onSort={toggleSort}
              />
              <SortableHead
                label={t("colLeads")}
                sortKey="leadsCreated"
                active={sort.key === "leadsCreated"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colWorkable")}
                sortKey="workableCreated"
                active={sort.key === "workableCreated"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colWorkableRate")}
                sortKey="workableRate"
                active={sort.key === "workableRate"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colWon")}
                sortKey="wonMonth"
                active={sort.key === "wonMonth"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colHitrate")}
                sortKey="hitrate"
                active={sort.key === "hitrate"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colWonPerDay")}
                sortKey="wonPerDay"
                active={sort.key === "wonPerDay"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colForecast")}
                sortKey="fc1"
                active={sort.key === "fc1"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colOppsOpen")}
                sortKey="oppsOpen"
                active={sort.key === "oppsOpen"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colAnalysis30")}
                sortKey="overduesAnalysis"
                active={sort.key === "overduesAnalysis"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colOppOverdue")}
                sortKey="overduesOpps"
                active={sort.key === "overduesOpps"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colOpps30")}
                sortKey="oppsOver30"
                active={sort.key === "oppsOver30"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colLeads14")}
                sortKey="leadsNoAction14"
                active={sort.key === "leadsNoAction14"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHead
                label={t("colOpps14")}
                sortKey="oppsNoAction14"
                active={sort.key === "oppsNoAction14"}
                dir={sort.dir}
                onSort={toggleSort}
                align="right"
              />
              <TableHead>{t("colBadges")}</TableHead>
              <TableHead>{t("colMark")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleSnaps.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={17}
                  className="text-center text-sm text-muted-foreground"
                >
                  {t("dashboardSearchEmpty")}
                </TableCell>
              </TableRow>
            )}
            {visibleSnaps.map(s => {
              const badges = data.badgeCounts[s.employeeId] ?? {};
              const mark = data.marks[s.employeeId];
              return (
                <TableRow
                  key={s.employeeId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/performance/mitarbeiter/${s.employeeId}`)
                  }
                >
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.leadsCreated)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.workableCreated)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPct(s.workableRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.wonMonth)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPct(s.hitrate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.wonPerDay)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.fc1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.oppsOpen)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.overduesAnalysis)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.overduesOpps)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.oppsOver30)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.leadsNoAction14)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.oppsNoAction14)}
                  </TableCell>
                  <TableCell>
                    {Object.entries(badges).some(([, n]) => n > 0) ? (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {Object.entries(badges)
                          .filter(([, n]) => n > 0)
                          .map(([key, n]) => (
                            <span key={key} title={t(`badgeLabel.${key}`)}>
                              {BADGE_ICONS[key] ?? ""}
                              {n > 1 ? `×${n}` : ""}
                            </span>
                          ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {mark && (
                      <Badge
                        variant={mark.level === "high" ? "success" : "warning"}
                      >
                        {mark.level === "high" ? t("markHigh") : t("markLow")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="w-8">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
