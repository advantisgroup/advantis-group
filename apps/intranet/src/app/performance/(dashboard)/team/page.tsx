"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { fmtNum, fmtPct } from "@/components/performance/PerformanceFormat";
import { PerformanceContentSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceYm } from "@/components/performance/PerformanceYmContext";
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
import { getPerformanceToken } from "@/lib/performanceAuth";
import { cn } from "@/lib/utils";

const BADGE_ICONS: Record<string, string> = {
  hitrate: "🎯",
  won: "🏆",
  calls: "📞",
};

type SortKey =
  | "name"
  | "leadsCreated"
  | "workableCreated"
  | "hitrate"
  | "wonMonth"
  | "fc1";

const SORT_KEYS: SortKey[] = [
  "name",
  "leadsCreated",
  "workableCreated",
  "hitrate",
  "wonMonth",
  "fc1",
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

export default function DashboardTeamPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const token = getPerformanceToken() ?? "";
  const [ym] = usePerformanceYm();
  const data = useQuery(api.performanceQueries.teamDashboard, { token, ym });

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
      ? (data?.snaps ?? []).filter(s => s.name.toLowerCase().includes(q))
      : (data?.snaps ?? []);
    rows = [...rows].sort((a, b) => {
      const cmp =
        sort.key === "name"
          ? a.name.localeCompare(b.name)
          : (a[sort.key] ?? -Infinity) - (b[sort.key] ?? -Infinity);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data?.snaps, search, sort]);

  if (!data) return <PerformanceContentSkeleton />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <CardTitle className="text-base">{t("dashboardEmployees")}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {t("dashboardShownCount", {
              shown: visibleSnaps.length,
              total: data.snaps.length,
            })}
          </span>
        </div>
        <div className="relative w-full max-w-[16rem]">
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
        <Table>
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
                label={t("colHitrate")}
                sortKey="hitrate"
                active={sort.key === "hitrate"}
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
                label={t("colForecast")}
                sortKey="fc1"
                active={sort.key === "fc1"}
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
                  colSpan={9}
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
                    {fmtPct(s.hitrate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.wonMonth)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtNum(s.fc1)}
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
