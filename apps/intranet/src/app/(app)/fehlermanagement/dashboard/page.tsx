"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { BarChart3, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Delta, Panel, SplitBar } from "@/components/admin/overview/primitives";
import { ClassicErrorDashboard } from "@/components/error-management/ClassicErrorDashboard";
import { Link } from "@/components/Link";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { DesignSwitch } from "@/lib/design-preview";
import {
  escalationLevel,
  isOverdue,
  REPORT_STATUSES,
  SEVERITIES,
  type ReportStatus,
  type Severity,
} from "@/lib/error-management";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [3, 6, 12] as const;

const SEVERITY_COLOR: Record<Severity, string> = {
  niedrig: "var(--muted-foreground)",
  mittel: "var(--chart-1)",
  hoch: "var(--warn)",
  kritisch: "var(--destructive)",
};

const STATUS_COLOR: Record<ReportStatus, string> = {
  neu: "var(--chart-1)",
  in_bearbeitung: "var(--warn)",
  geschlossen: "var(--ok)",
};

function monthKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function RefreshedErrorDashboard() {
  const t = useTranslations("ErrorManagement");
  const locale = useLocale();
  const reports = useQuery(api.errorReports.list);
  const [range, setRange] = useState<(typeof RANGES)[number]>(6);
  const [view, setView] = useState<"chart" | "table">("chart");

  const stats = useMemo(() => {
    if (!reports) return null;
    const now = Date.now();
    const today = new Date();
    const months = Array.from({ length: range }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (range - 1 - index), 1);
      return {
        key: monthKey(date.getTime()),
        label: date.toLocaleDateString(locale, { month: "short" }),
      };
    });
    const monthKeys = new Set(months.map((m) => m.key));
    const thisMonth = monthKey(now);
    const lastMonth = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime());

    const open = reports.filter((r) => r.status !== "geschlossen");
    const escalations = open
      .filter((r) => escalationLevel(r, now) === 3)
      .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
    const overdue = open.filter((r) => isOverdue(r, now));
    const oldestOverdueDays = overdue.reduce(
      (max, r) => Math.max(max, Math.floor((now - (r.dueAt ?? now)) / DAY_MS)),
      0,
    );
    const closedIn = (key: string) =>
      reports.filter((r) => r.closedAt && monthKey(r.closedAt) === key).length;
    const inRange = reports.filter((r) => monthKeys.has(monthKey(r.createdAt)));

    const byCategory = new Map<string, number>();
    for (const r of inRange) {
      const name = r.categoryName ?? t("fieldCategoryNone");
      byCategory.set(name, (byCategory.get(name) ?? 0) + 1);
    }

    return {
      now,
      open,
      newCount: open.filter((r) => r.status === "neu").length,
      escalations,
      criticalCount: open.filter((r) => r.severity === "kritisch").length,
      overdueCount: overdue.length,
      oldestOverdueDays,
      closedThisMonth: closedIn(thisMonth),
      closedLastMonth: closedIn(lastMonth),
      chart: months.map((m) => ({
        label: m.label,
        opened: reports.filter((r) => monthKey(r.createdAt) === m.key).length,
        closed: closedIn(m.key),
      })),
      inRangeCount: inRange.length,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
      bySeverity: SEVERITIES.map((s) => ({
        key: s,
        label: t(`severity.${s}`),
        value: inRange.filter((r) => r.severity === s).length,
        color: SEVERITY_COLOR[s],
      })),
      byStatus: REPORT_STATUSES.map((s) => ({
        key: s,
        label: t(`status.${s}`),
        value: inRange.filter((r) => r.status === s).length,
        color: STATUS_COLOR[s],
      })),
    };
  }, [reports, range, locale, t]);

  if (!stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const chartConfig = {
    opened: { label: t("opened"), color: "var(--chart-1)" },
    closed: { label: t("closedSeries"), color: "var(--chart-3)" },
  } satisfies ChartConfig;
  const closedDelta =
    stats.closedLastMonth === 0
      ? null
      : ((stats.closedThisMonth - stats.closedLastMonth) / stats.closedLastMonth) * 100;
  const categoryMax = Math.max(1, ...stats.byCategory.map(([, count]) => count));

  const now = stats.now;

  function dueLabel(dueAt: number | null) {
    if (dueAt === null) return t("noDueDate");
    const days = Math.floor((dueAt - now) / DAY_MS);
    if (days < 0) return t("overdueBy", { days: -days });
    if (days === 0) return t("dueToday");
    return t("dueIn", { days });
  }

  return (
    <div className="space-y-4" data-tour="tour-fehlermanagement-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("rangeSummary", { count: stats.inRangeCount, months: range })}
        </p>
        <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
          {RANGES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                range === value
                  ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("rangeMonths", { count: value })}
            </button>
          ))}
        </div>
      </div>

      <KpiStrip>
        <Kpi
          featured
          label={t("kpiOpen")}
          value={stats.open.length}
          hint={t("openHint", { count: stats.newCount })}
          href="/fehlermanagement?scope=offen"
        />
        <Kpi
          tone={stats.criticalCount > 0 ? "critical" : "neutral"}
          label={t("kpiCritical")}
          value={stats.criticalCount}
          hint={t("escalation.3")}
          href="/fehlermanagement?kpi=critical"
        />
        <Kpi
          tone={stats.overdueCount > 0 ? "warn" : "neutral"}
          label={t("kpiOverdue")}
          value={stats.overdueCount}
          hint={
            stats.overdueCount > 0
              ? t("oldestOverdue", { days: stats.oldestOverdueDays })
              : t("nothingOverdue")
          }
          href="/fehlermanagement?kpi=overdue"
        />
        <Kpi
          label={t("kpiClosedThisMonth")}
          value={stats.closedThisMonth}
          trailing={<Delta value={closedDelta} goodWhen="up" />}
          hint={t("closedLastMonth", { count: stats.closedLastMonth })}
          href="/fehlermanagement?scope=geschlossen&kpi=closed-month"
        />
      </KpiStrip>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          icon={<BarChart3 />}
          title={t("openedVsClosed")}
          action={
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
              {(["chart", "table"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                    view === value
                      ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "chart" ? t("viewChart") : t("viewTable")}
                </button>
              ))}
            </div>
          }
        >
          {view === "chart" ? (
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <BarChart data={stats.chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <ChartTooltip
                  cursor={{ fill: "var(--chart-cursor)" }}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="opened" fill="var(--color-opened)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="closed" fill="var(--color-closed)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">{t("monthColumn")}</th>
                    <th className="pb-2 text-right font-medium">{t("opened")}</th>
                    <th className="pb-2 text-right font-medium">{t("closedSeries")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats.chart].reverse().map((row) => (
                    <tr key={row.label} className="border-t border-border/60">
                      <td className="py-1.5">{row.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.opened}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.closed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          icon={<ShieldAlert />}
          title={t("needsEscalation")}
          description={t("escalation.3")}
          bodyClassName="p-0"
        >
          {stats.escalations.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {t("noEscalations")}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {stats.escalations.slice(0, 6).map((report) => {
                const late = report.dueAt !== null && report.dueAt < now;
                return (
                  <li key={report._id}>
                    <Link
                      href="/fehlermanagement?kpi=critical"
                      className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <span
                        className="h-full min-h-8 rounded-full"
                        style={{ background: SEVERITY_COLOR[report.severity] }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {report.description}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[report.customerOrProject, report.responsibleName]
                            .filter(Boolean)
                            .join(" · ") || t(`severity.${report.severity}`)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                          late ? "bg-warn/12 text-warn" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {dueLabel(report.dueAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={t("byCategory")}>
          {stats.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <div className="space-y-2.5">
              {stats.byCategory.map(([name, count]) => (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{name}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--chart-1)]"
                      style={{ width: `${(count / categoryMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title={t("bySeverity")}>
          <SplitBar segments={stats.bySeverity} />
        </Panel>
        <Panel title={t("byStatus")}>
          <SplitBar segments={stats.byStatus} />
        </Panel>
      </div>
    </div>
  );
}

export default function ErrorDashboardPage() {
  return (
    <DesignSwitch refreshed={<RefreshedErrorDashboard />} classic={<ClassicErrorDashboard />} />
  );
}
