"use client";

import { Suspense, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  ClipboardPlus,
  Ellipsis,
  Link2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { NewErrorDialog } from "@/components/error-management/NewErrorDialog";
import { PageHeaderActions } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CountTabs } from "@/components/ui/count-tabs";
import { useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill, TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import {
  PropertyButton,
  SidePanel,
  SidePanelProperties,
  SidePanelSection,
  StatusChip,
} from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import {
  CUSTOMER_FEEDBACKS,
  dateInputToMs,
  escalationLevel,
  isOverdue,
  msToDateInput,
  REPORT_STATUSES,
  responseAmpel,
  SEVERITIES,
  SEVERITY_ACCENT,
  STATUS_ACCENT,
  type ReportStatus,
  type Severity,
} from "@/lib/error-management";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Report = NonNullable<ReturnType<typeof useQuery<typeof api.errorReports.list>>>[number];
type Settings = NonNullable<ReturnType<typeof useQuery<typeof api.errorSettings.get>>>;
type Scope = "offen" | "alle" | "geschlossen";

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_ICON = { neu: CircleDashed, in_bearbeitung: CircleDot, geschlossen: CircleCheck };

function Dot({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        muted && "text-muted-foreground",
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function useDueLabel() {
  const t = useTranslations("ErrorManagement");
  return (report: Report, now: number) => {
    if (report.status === "geschlossen" || report.dueAt === null) return null;
    const days = Math.floor((report.dueAt - now) / DAY_MS);
    if (days < 0) return { text: t("overdueBy", { days: -days }), late: true };
    if (days === 0) return { text: t("dueToday"), late: false };
    return { text: t("dueIn", { days }), late: false };
  };
}

/** Customer-facing errors the customer hasn't heard about yet; green is the
 * expected state, so only amber and red are worth flagging. */
function notInformed(report: Report, settings: Settings | undefined, now: number) {
  if (!settings || !report.customerOrProject || report.customerInformedAt) return null;
  if (report.status === "geschlossen") return null;
  const ampel = responseAmpel(Math.floor((now - report.createdAt) / DAY_MS), settings);
  return ampel === "gruen" ? null : ampel;
}

function ErrorReportsContent() {
  const t = useTranslations("ErrorManagement");
  const router = useRouter();
  const params = useSearchParams();
  const reports = useQuery(api.errorReports.list);
  const settings = useQuery(api.errorSettings.get);
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

  const panelId = params.get("open");
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

  function openPanel(id: string) {
    router.replace(`/fehlermanagement?open=${id}`, { scroll: false });
  }

  function closePanel() {
    router.replace("/fehlermanagement", { scroll: false });
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
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setNewOpen(true)}>
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

function ErrorReportPanel({
  report,
  open,
  onOpenChange,
  settings,
}: {
  report: Report | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings | undefined;
}) {
  const tc = useTranslations("Common");
  // Holds the last report so the panel keeps its content while animating closed.
  const [shown, setShown] = useState(report);
  if (report && report !== shown) setShown(report);

  const accent = shown
    ? shown.status !== "geschlossen" && escalationLevel(shown) === 3
      ? "var(--destructive)"
      : STATUS_ACCENT[shown.status]
    : undefined;

  return (
    <SidePanel
      open={open && !!shown}
      onOpenChange={onOpenChange}
      title={shown?.description ?? ""}
      accent={accent}
      closeLabel={tc("close")}
      header={
        shown && <ErrorReportPanelHeader report={shown} onDeleted={() => onOpenChange(false)} />
      }
    >
      {shown && <ErrorReportPanelBody key={shown._id} report={shown} settings={settings} />}
    </SidePanel>
  );
}

function ErrorReportPanelHeader({ report, onDeleted }: { report: Report; onDeleted: () => void }) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const update = useMutation(api.errorReports.update);
  const remove = useMutation(api.errorReports.remove);
  const measures = useQuery(api.errorMeasures.list, { errorReportId: report._id });
  const dueLabel = useDueLabel();

  const shortDate = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const due = dueLabel(report, Date.now());

  async function changeStatus(status: ReportStatus) {
    if (status === report.status) return;
    if (
      status === "geschlossen" &&
      measures &&
      measures.length > 0 &&
      !measures.every((m) => m.effectivenessChecked)
    ) {
      const ok = await confirm({
        title: t("closeNeedsEffectivenessCheck"),
        confirmLabel: tc("confirm"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    try {
      await update({ reportId: report._id, patch: { status } });
      toast.success(t("updated"));
    } catch (error) {
      handleError(error);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteErrorConfirm"),
      details: [
        { label: tc("fieldTitle"), value: report.description },
        ...(report.categoryName
          ? [{ label: tc("fieldCategory"), value: report.categoryName }]
          : []),
      ],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ reportId: report._id });
      toast.success(t("deleted"));
      onDeleted();
    } catch (error) {
      handleError(error);
    }
  }

  function copyLink() {
    void navigator.clipboard
      .writeText(`${window.location.origin}/fehlermanagement?open=${report._id}`)
      .then(() => toast.success(t("linkCopied")));
  }

  return (
    <div className="md:pr-9">
      <div className="flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{report.categoryName ?? t("fieldCategoryNone")}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{t("loggedOn", { date: shortDate(report.createdAt) })}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground"
              aria-label={t("moreActions")}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={copyLink}>
              <Link2 />
              {t("copyLink")}
            </DropdownMenuItem>
            {isManager && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void onDelete()}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 />
                  {tc("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-lg font-semibold leading-snug tracking-tight text-balance">
        {report.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StatusChip
              accent={STATUS_ACCENT[report.status]}
              icon={STATUS_ICON[report.status]}
              label={t(`status.${report.status}`)}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {REPORT_STATUSES.map((status) => (
              <DropdownMenuItem key={status} onClick={() => void changeStatus(status)}>
                <Dot color={STATUS_ACCENT[status]} label={t(`status.${status}`)} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          className={cn("text-xs", due?.late ? "font-medium text-warn" : "text-muted-foreground")}
        >
          {report.status === "geschlossen" && report.closedAt
            ? t("closedOn", { date: shortDate(report.closedAt) })
            : (due?.text ?? t("noDueDate"))}
        </span>
      </div>
    </div>
  );
}

function ErrorReportPanelBody({
  report,
  settings,
}: {
  report: Report;
  settings: Settings | undefined;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const update = useMutation(api.errorReports.update);
  const categories = useQuery(api.errorCategories.list) ?? [];
  const measures = useQuery(api.errorMeasures.list, { errorReportId: report._id });
  const level = escalationLevel(report);
  const ampel = notInformed(report, settings, Date.now());

  function patch(fields: Parameters<typeof update>[0]["patch"]) {
    update({ reportId: report._id, patch: fields }).catch(handleError);
  }

  const inputClass = "h-8 text-sm md:h-8";

  return (
    <>
      <SidePanelSection title={t("details")}>
        <SidePanelProperties
          rows={[
            {
              label: t("fieldSeverity"),
              value: (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PropertyButton>
                      <Dot
                        color={SEVERITY_ACCENT[report.severity]}
                        label={t(`severity.${report.severity}`)}
                      />
                    </PropertyButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {SEVERITIES.map((s: Severity) => (
                      <DropdownMenuItem key={s} onClick={() => patch({ severity: s })}>
                        <Dot color={SEVERITY_ACCENT[s]} label={t(`severity.${s}`)} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
            {
              label: t("fieldCategory"),
              value: (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PropertyButton>
                      <span className={cn(!report.categoryName && "text-muted-foreground")}>
                        {report.categoryName ?? t("fieldCategoryNone")}
                      </span>
                    </PropertyButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                    {categories.map((category) => (
                      <DropdownMenuItem
                        key={category._id}
                        onClick={() => patch({ categoryId: category._id as Id<"errorCategories"> })}
                      >
                        {category.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => patch({ categoryId: undefined })}>
                      {t("fieldCategoryNone")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
            {
              label: t("fieldDueAt"),
              value: (
                <Input
                  type="date"
                  className={cn(inputClass, "w-auto")}
                  defaultValue={msToDateInput(report.dueAt)}
                  onBlur={(event) => patch({ dueAt: dateInputToMs(event.target.value) })}
                />
              ),
            },
            {
              label: t("fieldResponsible"),
              value: (
                <Input
                  className={inputClass}
                  defaultValue={report.responsibleName ?? ""}
                  placeholder={t("fieldResponsiblePlaceholder")}
                  onBlur={(event) =>
                    event.target.value !== (report.responsibleName ?? "") &&
                    patch({ responsibleName: event.target.value })
                  }
                />
              ),
            },
            ...(report.status !== "geschlossen"
              ? [
                  {
                    label: t("columnEscalation"),
                    value: (
                      <span
                        className={cn(
                          "text-sm",
                          level === 3 && "font-medium text-destructive",
                          level === 2 && "font-medium text-warn",
                        )}
                      >
                        {t(`escalation.${level}`)}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </SidePanelSection>

      <SidePanelSection title={t("fieldDescription")}>
        <Textarea
          defaultValue={report.description}
          className="min-h-20 text-sm"
          onBlur={(event) =>
            event.target.value.trim() &&
            event.target.value !== report.description &&
            patch({ description: event.target.value })
          }
        />
      </SidePanelSection>

      <SidePanelSection
        title={t("customerSection")}
        action={
          ampel && (
            <span
              className={cn(
                "text-[11px] font-medium",
                ampel === "rot" ? "text-destructive" : "text-warn",
              )}
            >
              {t("customerNotInformedBadge")}
            </span>
          )
        }
      >
        <SidePanelProperties
          rows={[
            {
              label: t("fieldCustomer"),
              value: (
                <Input
                  className={inputClass}
                  defaultValue={report.customerOrProject ?? ""}
                  placeholder={t("fieldCustomerPlaceholder")}
                  onBlur={(event) =>
                    event.target.value !== (report.customerOrProject ?? "") &&
                    patch({ customerOrProject: event.target.value })
                  }
                />
              ),
            },
            {
              label: t("fieldCustomerInformedAt"),
              value: (
                <Input
                  type="date"
                  className={cn(inputClass, "w-auto")}
                  defaultValue={msToDateInput(report.customerInformedAt)}
                  onBlur={(event) =>
                    patch({ customerInformedAt: dateInputToMs(event.target.value) })
                  }
                />
              ),
            },
            {
              label: t("fieldCustomerRespondedAt"),
              value: (
                <Input
                  type="date"
                  className={cn(inputClass, "w-auto")}
                  defaultValue={msToDateInput(report.customerRespondedAt)}
                  onBlur={(event) =>
                    patch({ customerRespondedAt: dateInputToMs(event.target.value) })
                  }
                />
              ),
            },
            {
              label: t("fieldCustomerFeedback"),
              value: (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PropertyButton>
                      <span className={cn(!report.customerFeedback && "text-muted-foreground")}>
                        {report.customerFeedback
                          ? t(`feedback.${report.customerFeedback}`)
                          : tc("none")}
                      </span>
                    </PropertyButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {CUSTOMER_FEEDBACKS.map((feedback) => (
                      <DropdownMenuItem
                        key={feedback}
                        onClick={() => patch({ customerFeedback: feedback })}
                      >
                        {t(`feedback.${feedback}`)}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => patch({ customerFeedback: undefined })}>
                      {tc("none")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]}
        />
      </SidePanelSection>

      <SidePanelSection title={t("preventionSection")}>
        <div className="space-y-3">
          <Textarea
            defaultValue={report.prevention ?? ""}
            placeholder={t("fieldPreventionPlaceholder")}
            className="min-h-20 text-sm"
            onBlur={(event) =>
              event.target.value !== (report.prevention ?? "") &&
              patch({ prevention: event.target.value })
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={report.effectivenessChecked}
              onCheckedChange={(value) => patch({ effectivenessChecked: value === true })}
            />
            {t("fieldEffectivenessChecked")}
          </label>
        </div>
      </SidePanelSection>

      <SidePanelSection
        title={t("tabMeasures")}
        action={
          <Button asChild variant="ghost" size="xs">
            <Link href={`/fehlermanagement/measures?error=${report._id}`}>
              <ClipboardPlus />
              {t("addMeasure")}
            </Link>
          </Button>
        }
      >
        {measures === undefined || measures.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMeasures")}</p>
        ) : (
          <ul className="space-y-2">
            {measures.map((measure) => (
              <li key={measure._id} className="flex items-start gap-2.5 text-sm">
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{
                    background:
                      measure.status === "erledigt" ? "var(--ok)" : "var(--muted-foreground)",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block",
                      measure.status === "erledigt" && "text-muted-foreground line-through",
                    )}
                  >
                    {measure.description}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`phase.${measure.phase}`)}
                    {measure.dueAt && ` · ${formatIsoDate(msToDateInput(measure.dueAt), locale)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SidePanelSection>
    </>
  );
}

export default function FehlermanagementPage() {
  return (
    <Suspense fallback={null}>
      <ErrorReportsContent />
    </Suspense>
  );
}
