"use client";

import { Suspense, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  type Report,
  type Scope,
  Dot,
  useDueLabel,
  notInformed,
  ErrorReportPanel,
} from "@/components/error-management/ErrorReportPanel";
import { NewErrorDialog } from "@/components/error-management/NewErrorDialog";
import { PageHeaderActions } from "@/components/layout/PageHeaderBar";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill, TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePanelParam } from "@/hooks/use-panel-param";
import {
  escalationLevel,
  isOverdue,
  SEVERITIES,
  SEVERITY_ACCENT,
  STATUS_ACCENT,
} from "@/lib/error-management";
import { cn } from "@/lib/utils";

function ErrorReportsContent() {
  const t = useTranslations("ErrorManagement");
  const params = useSearchParams();
  const reports = useQuery(api.fehlermanagement.reports.list);
  const settings = useQuery(api.fehlermanagement.settings.get);
  const dueLabel = useDueLabel();

  // Read once: the dashboard's KPI tiles link here with these, and later URL
  // changes (opening a report) shouldn't reset what the person has filtered.
  const initialKpi = params.get("kpi");
  const [scope, setScope] = useState<Scope>(() => {
    const value = params.get("scope");
    return value === "alle" || value === "geschlossen" ? value : "offen";
  });
  const [severities, setSeverities] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [criticalOnly, setCriticalOnly] = useState(initialKpi === "critical");
  const [overdueOnly, setOverdueOnly] = useState(initialKpi === "overdue");
  const [closedThisMonth, setClosedThisMonth] = useState(initialKpi === "closed-month");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(() => params.get("new") === "1");

  const { openId: panelId, openPanel, closePanel } = usePanelParam("/fehlermanagement");
  const all = useMemo(() => reports ?? [], [reports]);
  const now = Date.now();
  const query = search.trim().toLowerCase();

  const filteredByPills = useMemo(() => {
    const startOfMonth = new Date(new Date().setDate(1)).setHours(0, 0, 0, 0);
    return all.filter((r) => {
      if (severities.length > 0 && !severities.includes(r.severity)) return false;
      if (categories.length > 0 && !categories.includes(r.categoryName ?? "")) return false;
      if (criticalOnly && escalationLevel(r) !== 3) return false;
      if (overdueOnly && !isOverdue(r)) return false;
      if (closedThisMonth && (!r.closedAt || r.closedAt < startOfMonth)) return false;
      if (!query) return true;
      return [r.description, r.customerOrProject, r.categoryName, r.responsibleName]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [all, severities, categories, criticalOnly, overdueOnly, closedThisMonth, query]);

  const inScope = (r: Report, s: Scope) =>
    s === "alle" || (s === "offen" ? r.status !== "geschlossen" : r.status === "geschlossen");
  const rows = filteredByPills.filter((r) => inScope(r, scope));
  const categoryNames = [...new Set(all.map((r) => r.categoryName ?? ""))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const filtersActive =
    severities.length > 0 ||
    categories.length > 0 ||
    criticalOnly ||
    overdueOnly ||
    closedThisMonth ||
    query !== "";

  function clearFilters() {
    setSeverities([]);
    setCategories([]);
    setCriticalOnly(false);
    setOverdueOnly(false);
    setClosedThisMonth(false);
    setSearch("");
  }

  return (
    <div data-tour="tour-fehlermanagement-list">
      <PageHeaderActions
        actions={[
          {
            key: "new-error",
            label: t("newError"),
            icon: Plus,
            onClick: () => setNewOpen(true),
          },
        ]}
      />

      <CountTabs
        value={scope}
        onChange={setScope}
        tabs={(["offen", "alle", "geschlossen"] as const).map((value) => ({
          value,
          label: t(value === "offen" ? "scopeOpen" : value === "alle" ? "scopeAll" : "scopeClosed"),
          count: filteredByPills.filter((r) => inScope(r, value)).length,
        }))}
      />

      <div className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
          />
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0">
          <FilterPill
            label={t("fieldSeverity")}
            options={SEVERITIES.map((s) => ({
              value: s,
              label: t(`severity.${s}`),
              count: all.filter((r) => r.severity === s).length,
              leading: (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: SEVERITY_ACCENT[s] }}
                />
              ),
            }))}
            selected={severities}
            onChange={setSeverities}
            clearLabel={t("clearFilter", { label: t("fieldSeverity") })}
          />
          <FilterPill
            label={t("fieldCategory")}
            options={categoryNames.map((name) => ({
              value: name,
              label: name,
              count: all.filter((r) => r.categoryName === name).length,
            }))}
            selected={categories}
            onChange={setCategories}
            clearLabel={t("clearFilter", { label: t("fieldCategory") })}
          />
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <TogglePill
            active={criticalOnly}
            onClick={() => setCriticalOnly((v) => !v)}
            count={all.filter((r) => r.status !== "geschlossen" && escalationLevel(r) === 3).length}
            dotClassName="bg-destructive"
          >
            {t("kpiCritical")}
          </TogglePill>
          <TogglePill
            active={overdueOnly}
            onClick={() => setOverdueOnly((v) => !v)}
            count={all.filter((r) => isOverdue(r)).length}
            dotClassName="bg-warn"
          >
            {t("kpiOverdue")}
          </TogglePill>
          <TogglePill active={closedThisMonth} onClick={() => setClosedThisMonth((v) => !v)}>
            {t("kpiClosedThisMonth")}
          </TogglePill>
          {filtersActive && (
            <Button variant="ghost" size="xs" className="shrink-0" onClick={clearFilters}>
              <X />
              {t("clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {reports === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle />}
          title={all.length === 0 ? t("empty") : t("noResults")}
          description={all.length === 0 ? t("emptyHint") : undefined}
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            ) : (
              <Button data-shortcut-new size="sm" onClick={() => setNewOpen(true)}>
                <Plus />
                {t("newError")}
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("columnError")}</TableHead>
                <TableHead className="w-32">{t("fieldSeverity")}</TableHead>
                <TableHead className="w-36">{t("fieldStatus")}</TableHead>
                <TableHead className="w-36">{t("columnDue")}</TableHead>
                <TableHead className="w-44">{t("fieldResponsible")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((report) => {
                const level = escalationLevel(report, now);
                const due = dueLabel(report, now);
                const ampel = notInformed(report, settings, now);
                return (
                  <TableRow
                    key={report._id}
                    tabIndex={0}
                    data-state={report._id === panelId ? "selected" : undefined}
                    onClick={() => openPanel(report._id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openPanel(report._id);
                    }}
                    className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <TableCell className="w-full max-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        {report.status !== "geschlossen" && level > 1 && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              level === 3
                                ? "bg-destructive/12 text-destructive"
                                : "bg-warn/12 text-warn",
                            )}
                          >
                            {t("escalationShort", { level })}
                          </span>
                        )}
                        <span className="truncate font-medium">{report.description}</span>
                        {report.customerOrProject && (
                          <span className="hidden shrink-0 text-muted-foreground lg:inline">
                            {report.customerOrProject}
                          </span>
                        )}
                        {ampel && (
                          <span
                            className={cn(
                              "shrink-0 text-[11px] font-medium",
                              ampel === "rot" ? "text-destructive" : "text-warn",
                            )}
                          >
                            {t("notInformedShort")}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Dot
                        color={SEVERITY_ACCENT[report.severity]}
                        label={t(`severity.${report.severity}`)}
                      />
                    </TableCell>
                    <TableCell>
                      <Dot
                        color={STATUS_ACCENT[report.status]}
                        label={t(`status.${report.status}`)}
                        muted={report.status === "geschlossen"}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {due ? (
                        <span
                          className={due.late ? "font-medium text-warn" : "text-muted-foreground"}
                        >
                          {due.text}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-44 truncate text-muted-foreground">
                      {report.responsibleName ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <ul className="divide-y divide-border/60 md:hidden">
            {rows.map((report) => {
              const due = dueLabel(report, now);
              return (
                <li
                  key={report._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPanel(report._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") openPanel(report._id);
                  }}
                  className="space-y-1.5 px-4 py-3 active:bg-accent/60"
                >
                  <div className="flex items-center gap-3 text-xs">
                    <Dot
                      color={SEVERITY_ACCENT[report.severity]}
                      label={t(`severity.${report.severity}`)}
                    />
                    <span className="ml-auto">
                      <Dot
                        color={STATUS_ACCENT[report.status]}
                        label={t(`status.${report.status}`)}
                        muted={report.status === "geschlossen"}
                      />
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{report.description}</p>
                  <p className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">
                      {[report.customerOrProject, report.responsibleName]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {due && (
                      <span className={cn("shrink-0", due.late && "font-medium text-warn")}>
                        {due.text}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-border/70 px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
            {t("countLabel", { shown: rows.length, total: all.length })}
          </div>
        </div>
      )}

      <ErrorReportPanel
        report={all.find((r) => r._id === panelId)}
        open={!!panelId}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
        settings={settings}
      />
      <NewErrorDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

export default function FehlermanagementPage() {
  return (
    <Suspense fallback={null}>
      <ErrorReportsContent />
    </Suspense>
  );
}
