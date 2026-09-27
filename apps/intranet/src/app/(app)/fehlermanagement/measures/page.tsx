"use client";

import { Suspense, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ClipboardList, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  type Measure,
  type Scope,
  EMPTY_REPORTS,
  NO_OWNER,
  phaseCode,
  useDue,
  MeasureStatusDot,
  MeasurePanel,
} from "@/components/error-management/MeasurePanel";
import { NewMeasureDialog } from "@/components/error-management/NewMeasureDialog";
import { PageHeaderActions } from "@/components/layout/PageHeaderBar";
import { PersonLink } from "@/components/profile/PersonLink";
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
import { MEASURE_PHASES } from "@/lib/error-management";
import { cn } from "@/lib/utils";

function MeasuresContent() {
  const t = useTranslations("ErrorManagement");
  const params = useSearchParams();
  const measures = useQuery(api.fehlermanagement.measures.list, {});
  const reports = useQuery(api.fehlermanagement.reports.list) ?? EMPTY_REPORTS;
  const due = useDue();

  // Read once — an error's panel links here to add a measure for it.
  const [errorFilter, setErrorFilter] = useState<string | null>(() => params.get("error"));
  const [newOpen, setNewOpen] = useState(() => params.get("error") !== null);
  const [scope, setScope] = useState<Scope>("offen");
  const [phases, setPhases] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { openId: panelId, openPanel, closePanel } = usePanelParam("/fehlermanagement/measures");
  const all = useMemo(() => measures ?? [], [measures]);
  const reportById = useMemo(() => new Map(reports.map((r) => [String(r._id), r])), [reports]);
  const now = Date.now();
  const query = search.trim().toLowerCase();

  const filteredByPills = useMemo(
    () =>
      all.filter((m) => {
        if (errorFilter && m.errorReportId !== errorFilter) return false;
        if (phases.length > 0 && !phases.includes(m.phase)) return false;
        if (owners.length > 0 && !owners.includes(m.ownerUserId ?? NO_OWNER)) return false;
        if (overdueOnly && !(m.status === "offen" && m.dueAt !== null && m.dueAt < now)) {
          return false;
        }
        if (!query) return true;
        return [m.description, m.ownerName, reportById.get(String(m.errorReportId))?.description]
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [all, errorFilter, phases, owners, overdueOnly, query, reportById, now],
  );

  const inScope = (m: Measure, s: Scope) => s === "alle" || m.status === s;
  const rows = filteredByPills.filter((m) => inScope(m, scope));
  const ownerOptions = [
    ...new Map(
      all.filter((m) => m.ownerUserId).map((m) => [String(m.ownerUserId), m.ownerName ?? "—"]),
    ).entries(),
  ].map(([value, label]) => ({
    value,
    label,
    count: all.filter((m) => m.ownerUserId === value).length,
  }));
  const filteredError = errorFilter ? reportById.get(errorFilter) : undefined;
  const filtersActive =
    !!errorFilter || phases.length > 0 || owners.length > 0 || overdueOnly || query !== "";

  function clearFilters() {
    setErrorFilter(null);
    setPhases([]);
    setOwners([]);
    setOverdueOnly(false);
    setSearch("");
  }

  return (
    <div data-tour="tour-fehlermanagement-measures">
      <PageHeaderActions
        actions={[
          {
            key: "new-measure",
            label: t("newMeasure"),
            icon: Plus,
            onClick: () => setNewOpen(true),
          },
        ]}
      />

      <CountTabs
        value={scope}
        onChange={setScope}
        tabs={(["offen", "alle", "erledigt"] as const).map((value) => ({
          value,
          label: t(
            value === "offen"
              ? "measureScopeOpen"
              : value === "alle"
                ? "measureScopeAll"
                : "measureScopeDone",
          ),
          count: filteredByPills.filter((m) => inScope(m, value)).length,
        }))}
      />

      <div className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("measureSearchPlaceholder")}
            aria-label={t("measureSearchPlaceholder")}
            className="h-9 pl-8 text-sm md:h-8 md:text-[13px]"
          />
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0">
          {filteredError && (
            <span className="inline-flex h-8 max-w-64 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-1 text-xs font-medium md:h-7">
              {t("fieldLinkedError")}:
              <span className="truncate font-semibold text-primary">
                {filteredError.description}
              </span>
              <button
                type="button"
                aria-label={t("clearFilter", { label: t("fieldLinkedError") })}
                onClick={() => setErrorFilter(null)}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          <FilterPill
            label={t("fieldPhase")}
            options={MEASURE_PHASES.map((phase) => ({
              value: phase,
              label: t(`phase.${phase}`),
              count: all.filter((m) => m.phase === phase).length,
            }))}
            selected={phases}
            onChange={setPhases}
            clearLabel={t("clearFilter", { label: t("fieldPhase") })}
          />
          <FilterPill
            label={t("fieldOwner")}
            options={[
              ...ownerOptions,
              {
                value: NO_OWNER,
                label: t("ownerUnassigned"),
                count: all.filter((m) => !m.ownerUserId).length,
              },
            ]}
            selected={owners}
            onChange={setOwners}
            clearLabel={t("clearFilter", { label: t("fieldOwner") })}
          />
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <TogglePill
            active={overdueOnly}
            onClick={() => setOverdueOnly((v) => !v)}
            count={
              all.filter((m) => m.status === "offen" && m.dueAt !== null && m.dueAt < now).length
            }
            dotClassName="bg-warn"
          >
            {t("kpiOverdue")}
          </TogglePill>
          {filtersActive && (
            <Button variant="ghost" size="xs" className="shrink-0" onClick={clearFilters}>
              <X />
              {t("clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {measures === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={all.length === 0 ? t("noMeasures") : t("noMeasuresFiltered")}
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            ) : (
              <Button data-shortcut-new size="sm" onClick={() => setNewOpen(true)}>
                <Plus />
                {t("newMeasure")}
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("columnMeasure")}</TableHead>
                <TableHead className="w-24">{t("fieldPhase")}</TableHead>
                <TableHead className="w-44">{t("fieldOwner")}</TableHead>
                <TableHead className="w-36">{t("columnDue")}</TableHead>
                <TableHead className="w-28">{t("fieldStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((measure) => {
                const dueLabel = due(measure, now);
                const linkedError = reportById.get(String(measure.errorReportId));
                return (
                  <TableRow
                    key={measure._id}
                    tabIndex={0}
                    data-state={measure._id === panelId ? "selected" : undefined}
                    onClick={() => openPanel(measure._id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openPanel(measure._id);
                    }}
                    className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <TableCell className="w-full max-w-0">
                      <span
                        className={cn(
                          "block truncate font-medium",
                          measure.status === "erledigt" && "text-muted-foreground",
                        )}
                      >
                        {measure.description}
                      </span>
                      {linkedError && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {linkedError.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        title={t(`phase.${measure.phase}`)}
                        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium"
                      >
                        {phaseCode(measure.phase)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-44">
                      {measure.ownerUserId && measure.ownerName ? (
                        <PersonLink userId={measure.ownerUserId}>{measure.ownerName}</PersonLink>
                      ) : (
                        <span className="text-muted-foreground">
                          {measure.responsibleName ?? t("ownerUnassigned")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {dueLabel ? (
                        <span
                          className={
                            dueLabel.late ? "font-medium text-warn" : "text-muted-foreground"
                          }
                        >
                          {dueLabel.text}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <MeasureStatusDot status={measure.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <ul className="divide-y divide-border/60 md:hidden">
            {rows.map((measure) => {
              const dueLabel = due(measure, now);
              return (
                <li
                  key={measure._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPanel(measure._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") openPanel(measure._id);
                  }}
                  className="space-y-1.5 px-4 py-3 active:bg-accent/60"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium">
                      {phaseCode(measure.phase)}
                    </span>
                    <span className="ml-auto">
                      <MeasureStatusDot status={measure.status} />
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{measure.description}</p>
                  <p className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">{measure.ownerName ?? t("ownerUnassigned")}</span>
                    {dueLabel && (
                      <span className={cn("shrink-0", dueLabel.late && "font-medium text-warn")}>
                        {dueLabel.text}
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

      <MeasurePanel
        measure={all.find((m) => m._id === panelId)}
        linkedErrorLabel={
          reportById.get(String(all.find((m) => m._id === panelId)?.errorReportId))?.description
        }
        open={!!panelId}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
      />
      <NewMeasureDialog open={newOpen} onOpenChange={setNewOpen} defaultErrorId={errorFilter} />
    </div>
  );
}

export default function MeasuresPage() {
  return (
    <Suspense fallback={null}>
      <MeasuresContent />
    </Suspense>
  );
}
