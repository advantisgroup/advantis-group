"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import {
  escalationLevel,
  isOverdue,
  msToDateInput,
  REPORT_STATUSES,
  SEVERITIES,
} from "@/lib/error-management";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function BreakdownBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ErrorDashboardPage() {
  const t = useTranslations("ErrorManagement");
  const reports = useQuery(api.errorReports.list);

  const stats = useMemo(() => {
    if (!reports) return null;
    const now = Date.now();
    const startOfMonth = new Date(new Date().setDate(1)).setHours(0, 0, 0, 0);
    const open = reports.filter((r) => r.status !== "geschlossen");
    const critical = reports.filter(
      (r) => escalationLevel({ severity: r.severity, status: r.status, dueAt: r.dueAt }, now) === 3,
    );
    const overdue = reports.filter((r) =>
      isOverdue({ severity: r.severity, status: r.status, dueAt: r.dueAt }, now),
    );
    const closedThisMonth = reports.filter(
      (r) => r.status === "geschlossen" && r.closedAt && r.closedAt >= startOfMonth,
    );

    const byCategory = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const bySeverity = new Map<string, number>();
    const byMonth = new Map<string, { total: number; closed: number }>();

    for (const r of reports) {
      const cat = r.categoryName ?? t("fieldCategoryNone");
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
      bySeverity.set(r.severity, (bySeverity.get(r.severity) ?? 0) + 1);
      const monthKey = msToDateInput(r.createdAt).slice(0, 7);
      const entry = byMonth.get(monthKey) ?? { total: 0, closed: 0 };
      entry.total += 1;
      if (r.status === "geschlossen") entry.closed += 1;
      byMonth.set(monthKey, entry);
    }

    return {
      openCount: open.length,
      criticalCount: critical.length,
      overdueCount: overdue.length,
      closedThisMonthCount: closedThisMonth.length,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
      byStatus,
      bySeverity,
      byMonth: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12),
      total: reports.length,
    };
  }, [reports, t]);

  if (!stats) return null;

  return (
    <div className="space-y-6" data-tour="tour-fehlermanagement-dashboard">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("kpiOpen")} value={stats.openCount} />
        <StatTile label={t("kpiCritical")} value={stats.criticalCount} />
        <StatTile label={t("kpiOverdue")} value={stats.overdueCount} />
        <StatTile label={t("kpiClosedThisMonth")} value={stats.closedThisMonthCount} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("byCategory")}
            </p>
            {stats.byCategory.map(([name, count]) => (
              <BreakdownBar key={name} label={name} count={count} total={stats.total} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("byStatus")}
            </p>
            {REPORT_STATUSES.map((s) => (
              <BreakdownBar
                key={s}
                label={t(`status.${s}`)}
                count={stats.byStatus.get(s) ?? 0}
                total={stats.total}
              />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("bySeverity")}
            </p>
            {SEVERITIES.map((s) => (
              <BreakdownBar
                key={s}
                label={t(`severity.${s}`)}
                count={stats.bySeverity.get(s) ?? 0}
                total={stats.total}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("byMonth")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("monthColumn")}</th>
                  <th className="pb-2 font-medium">{t("totalColumn")}</th>
                  <th className="pb-2 font-medium">{t("closedColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.byMonth.map(([month, { total, closed }]) => (
                  <tr key={month} className="border-t border-border/60">
                    <td className="py-1.5 tabular-nums">{month}</td>
                    <td className="py-1.5 tabular-nums">{total}</td>
                    <td className="py-1.5 tabular-nums">{closed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
