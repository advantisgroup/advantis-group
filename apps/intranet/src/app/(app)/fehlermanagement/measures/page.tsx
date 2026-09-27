"use client";

import { Suspense, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Ellipsis,
  ExternalLink,
  FileText,
  Link2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { NewMeasureDialog } from "@/components/error-management/NewMeasureDialog";
import { useFileViewer } from "@/components/file-viewer/FileViewerProvider";
import { PageHeaderActions } from "@/components/layout/PageHeaderBar";
import { Link } from "@/components/Link";
import { PersonPicker } from "@/components/people/PersonPicker";
import { PersonLink } from "@/components/profile/PersonLink";
import { useIsManager } from "@/components/providers/current-user";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useErrorHandler } from "@/hooks/use-error-handler";
import { copyPanelLink, usePanelParam } from "@/hooks/use-panel-param";
import {
  dateInputToMs,
  MEASURE_PHASES,
  msToDateInput,
  type MeasurePhase,
  type MeasureStatus,
} from "@/lib/error-management";
import { formatDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Measure = NonNullable<
  ReturnType<typeof useQuery<typeof api.fehlermanagement.measures.list>>
>[number];
type Scope = "offen" | "alle" | "erledigt";
type RelatedLinkType = "guidebook" | "announcement" | "ticket" | "other";

const DAY_MS = 24 * 60 * 60 * 1000;
const RELATED_LINK_TYPES: RelatedLinkType[] = ["guidebook", "announcement", "ticket", "other"];
const EMPTY_REPORTS: NonNullable<
  ReturnType<typeof useQuery<typeof api.fehlermanagement.reports.list>>
> = [];
const NO_OWNER = "none";

function nextPhase(phase: MeasurePhase): MeasurePhase | null {
  const index = MEASURE_PHASES.indexOf(phase);
  return index >= 0 ? (MEASURE_PHASES[index + 1] ?? null) : null;
}

/** "D3" out of "d3_sofort", "D5/D6" out of "d5_d6_abstellung". */
function phaseCode(phase: MeasurePhase): string {
  return phase
    .split("_")
    .filter((part) => /^d\d$/.test(part))
    .map((part) => part.toUpperCase())
    .join("/");
}

function useDue() {
  const t = useTranslations("ErrorManagement");
  return (measure: Measure, now: number) => {
    if (measure.status === "erledigt" || measure.dueAt === null) return null;
    const days = Math.floor((measure.dueAt - now) / DAY_MS);
    if (days < 0) return { text: t("overdueBy", { days: -days }), late: true };
    if (days === 0) return { text: t("dueToday"), late: false };
    return { text: t("dueIn", { days }), late: false };
  };
}

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

function MeasureStatusDot({ status }: { status: MeasureStatus }) {
  const t = useTranslations("ErrorManagement");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        status === "erledigt" && "text-muted-foreground",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: status === "erledigt" ? "var(--ok)" : "var(--warn)" }}
      />
      {t(`measureStatus.${status}`)}
    </span>
  );
}

function MeasurePanel({
  measure,
  linkedErrorLabel,
  open,
  onOpenChange,
}: {
  measure: Measure | undefined;
  linkedErrorLabel: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tc = useTranslations("Common");
  // Holds the last measure so the panel keeps its content while animating closed.
  const [shown, setShown] = useState(measure);
  if (measure && measure !== shown) setShown(measure);

  return (
    <SidePanel
      open={open && !!shown}
      onOpenChange={onOpenChange}
      title={shown?.description ?? ""}
      accent={shown ? (shown.status === "erledigt" ? "var(--ok)" : "var(--warn)") : undefined}
      closeLabel={tc("close")}
      header={
        shown && (
          <MeasurePanelHeader
            measure={shown}
            linkedErrorLabel={linkedErrorLabel}
            onDeleted={() => onOpenChange(false)}
          />
        )
      }
    >
      {shown && <MeasurePanelBody key={shown._id} measure={shown} />}
    </SidePanel>
  );
}

function MeasurePanelHeader({
  measure,
  linkedErrorLabel,
  onDeleted,
}: {
  measure: Measure;
  linkedErrorLabel: string | undefined;
  onDeleted: () => void;
}) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const update = useMutation(api.fehlermanagement.measures.update);
  const remove = useMutation(api.fehlermanagement.measures.remove);
  const due = useDue()(measure, Date.now());

  const shortDate = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  async function changeStatus(status: MeasureStatus) {
    if (status === measure.status) return;
    try {
      if (status === "erledigt") {
        const next = nextPhase(measure.phase);
        if (next) {
          const shouldMove = await confirm({
            title: t("measureAdvanceTitle"),
            description: t("measureAdvanceDescription", {
              current: t(`phase.${measure.phase}`),
              next: t(`phase.${next}`),
            }),
            confirmLabel: t("measureAdvanceConfirm"),
            cancelLabel: tc("cancel"),
          });
          if (!shouldMove) return;
          await update({
            measureId: measure._id,
            patch: { phase: next, status: "offen", effectivenessChecked: false },
          });
          toast.success(t("updated"));
          return;
        }
      }
      await update({ measureId: measure._id, patch: { status } });
      toast.success(t("updated"));
    } catch (error) {
      handleError(error);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteMeasureConfirm"),
      details: [{ label: tc("fieldTitle"), value: measure.description }],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove({ measureId: measure._id });
      toast.success(t("deleted"));
      onDeleted();
    } catch (error) {
      handleError(error);
    }
  }

  function copyLink() {
    void copyPanelLink("/fehlermanagement/measures", measure._id).then(() =>
      toast.success(t("linkCopied")),
    );
  }

  return (
    <div className="md:pr-9">
      <div className="flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href={`/fehlermanagement?open=${measure.errorReportId}`}
          className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline"
        >
          <span className="truncate">{linkedErrorLabel ?? t("fieldLinkedError")}</span>
          <ArrowUpRight className="size-3 shrink-0" />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0 text-muted-foreground"
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
        {measure.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StatusChip
              accent={measure.status === "erledigt" ? "var(--ok)" : "var(--warn)"}
              icon={measure.status === "erledigt" ? CircleCheck : CircleDashed}
              label={t(`measureStatus.${measure.status}`)}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(["offen", "erledigt"] as const).map((status) => (
              <DropdownMenuItem key={status} onClick={() => void changeStatus(status)}>
                <MeasureStatusDot status={status} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          className={cn("text-xs", due?.late ? "font-medium text-warn" : "text-muted-foreground")}
        >
          {measure.status === "erledigt" && measure.completedAt
            ? t("completedOn", { date: shortDate(measure.completedAt) })
            : (due?.text ?? t("noDueDate"))}
        </span>
      </div>
    </div>
  );
}

function MeasurePanelBody({ measure }: { measure: Measure }) {
  const t = useTranslations("ErrorManagement");
  const isManager = useIsManager();
  const handleError = useErrorHandler();
  const update = useMutation(api.fehlermanagement.measures.update);
  const currentIndex = MEASURE_PHASES.indexOf(measure.phase);

  function patch(fields: Parameters<typeof update>[0]["patch"]) {
    update({ measureId: measure._id, patch: fields }).catch(handleError);
  }

  return (
    <>
      <SidePanelSection title={t("fieldPhase")}>
        {/* The 8D steps are a real sequence, so the position reads as a path
            rather than a single label. */}
        <ol className="flex gap-1" aria-label={t("fieldPhase")}>
          {MEASURE_PHASES.map((phase, index) => (
            <li key={phase} className="min-w-0 flex-1">
              <button
                type="button"
                title={t(`phase.${phase}`)}
                onClick={() => phase !== measure.phase && patch({ phase })}
                className="group block w-full text-left"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-colors",
                    index < currentIndex && "bg-foreground/40",
                    index === currentIndex && "bg-foreground",
                    index > currentIndex && "bg-muted group-hover:bg-muted-foreground/30",
                  )}
                />
                <span
                  className={cn(
                    "mt-1.5 block font-mono text-[11px]",
                    index === currentIndex ? "font-semibold" : "text-muted-foreground",
                  )}
                >
                  {phaseCode(phase)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm">{t(`phase.${measure.phase}`)}</p>
      </SidePanelSection>

      <SidePanelSection title={t("details")}>
        <SidePanelProperties
          rows={[
            {
              label: t("fieldOwner"),
              value: isManager ? (
                <PersonPicker
                  value={measure.ownerUserId ?? null}
                  onChange={(ownerUserId) => patch({ ownerUserId: ownerUserId ?? undefined })}
                  label={t("fieldOwner")}
                  noneLabel={t("ownerUnassigned")}
                  trigger={
                    <PropertyButton>
                      <span className={cn(!measure.ownerName && "text-muted-foreground")}>
                        {measure.ownerName ?? t("ownerUnassigned")}
                      </span>
                    </PropertyButton>
                  }
                />
              ) : measure.ownerUserId && measure.ownerName ? (
                <PersonLink userId={measure.ownerUserId}>{measure.ownerName}</PersonLink>
              ) : (
                <span className="text-muted-foreground">
                  {measure.responsibleName ?? t("ownerUnassigned")}
                </span>
              ),
            },
            {
              label: t("fieldDueAt"),
              value: (
                <Input
                  type="date"
                  className="h-8 w-auto text-sm"
                  defaultValue={msToDateInput(measure.dueAt)}
                  onBlur={(event) => patch({ dueAt: dateInputToMs(event.target.value) })}
                />
              ),
            },
            {
              label: t("fieldEffectivenessChecked"),
              value: (
                <Checkbox
                  checked={measure.effectivenessChecked}
                  onCheckedChange={(value) => patch({ effectivenessChecked: value === true })}
                  aria-label={t("fieldEffectivenessChecked")}
                />
              ),
            },
          ]}
        />
      </SidePanelSection>

      {measure.completedAt && <MeasureEffectiveness measure={measure} />}
      <MeasureRelatedLinks measure={measure} />
      <MeasureDocuments measure={measure} />
    </>
  );
}

function MeasureEffectiveness({ measure }: { measure: Measure }) {
  const t = useTranslations("ErrorManagement");
  const result = useQuery(api.fehlermanagement.measures.effectiveness, { measureId: measure._id });
  if (!result) return null;
  const max = Math.max(result.before, result.after, 1);
  const verdict =
    result.after < result.before ? "better" : result.after > result.before ? "worse" : "same";

  return (
    <SidePanelSection title={t("effectivenessTitle")}>
      <div className="space-y-2">
        {(
          [
            ["before", result.before],
            ["after", result.after],
          ] as const
        ).map(([key, count]) => (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-muted-foreground">
              {t(key === "before" ? "effectivenessBefore" : "effectivenessAfter")}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  key === "before" ? "bg-muted-foreground/40" : "bg-foreground",
                )}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
          </div>
        ))}
      </div>
      <p
        className={cn(
          "mt-2.5 text-xs",
          verdict === "better" && "text-success",
          verdict === "worse" && "text-warning",
          verdict === "same" && "text-muted-foreground",
        )}
      >
        {t(`effectiveness_${verdict}`, { category: result.categoryName ?? "—" })}
        {!result.windowDone && ` ${t("effectivenessPending")}`}
      </p>
    </SidePanelSection>
  );
}

function MeasureRelatedLinks({ measure }: { measure: Measure }) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const isManager = useIsManager();
  const handleError = useErrorHandler();
  const update = useMutation(api.fehlermanagement.measures.update);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<RelatedLinkType>("guidebook");

  if (measure.relatedLinks.length === 0 && !isManager) return null;

  async function addLink() {
    if (!label.trim() || !url.trim()) return;
    try {
      await update({
        measureId: measure._id,
        patch: {
          relatedLinks: [...measure.relatedLinks, { type, label: label.trim(), url: url.trim() }],
        },
      });
      setLabel("");
      setUrl("");
      setType("guidebook");
      setOpen(false);
    } catch (error) {
      handleError(error);
    }
  }

  function removeLink(index: number) {
    update({
      measureId: measure._id,
      patch: { relatedLinks: measure.relatedLinks.filter((_, i) => i !== index) },
    }).catch(handleError);
  }

  return (
    <SidePanelSection
      title={t("relatedLinks")}
      action={
        isManager &&
        measure.relatedLinks.length < 5 && (
          <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
            <Plus />
            {t("addRelatedLink")}
          </Button>
        )
      }
    >
      {measure.relatedLinks.length > 0 && (
        <ul className="space-y-1">
          {measure.relatedLinks.map((link, index) => (
            <li
              key={`${link.url}-${link.label}`}
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/40"
            >
              {link.url.startsWith("/") ? (
                <Link
                  href={link.url}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <span className="truncate">{link.label}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </Link>
              ) : (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <span className="truncate">{link.label}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              )}
              {isManager && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("removeRelatedLink", { label: link.label })}
                  onClick={() => removeLink(index)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("addRelatedLink")}
        contentClassName="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => void addLink()} disabled={!label.trim() || !url.trim()}>
              {tc("add")}
            </Button>
          </>
        }
      >
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          {t("fieldRelatedLinkType")}
          <Select value={type} onValueChange={(value) => setType(value as RelatedLinkType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATED_LINK_TYPES.map((linkType) => (
                <SelectItem key={linkType} value={linkType}>
                  {t(`relatedLinkType.${linkType}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          {t("fieldRelatedLinkLabel")}
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t("fieldRelatedLinkLabelPlaceholder")}
            autoFocus
          />
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          {t("fieldRelatedLinkUrl")}
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("fieldRelatedLinkUrlPlaceholder")}
          />
        </label>
      </ResponsiveDialog>
    </SidePanelSection>
  );
}

function MeasureDocuments({ measure }: { measure: Measure }) {
  const t = useTranslations("ErrorManagement");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const isManager = useIsManager();
  const handleError = useErrorHandler();
  const { openFileViewer } = useFileViewer();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const addDocument = useMutation(api.fehlermanagement.measures.addDocument);
  const removeDocument = useMutation(api.fehlermanagement.measures.removeDocument);
  const documents = useQuery(api.fehlermanagement.measures.listDocuments, {
    measureId: measure._id,
  });
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const uploaded = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploaded.ok) throw new Error(t("documentUploadFailed"));
      const { storageId } = (await uploaded.json()) as { storageId: Id<"_storage"> };
      await addDocument({
        measureId: measure._id,
        storageId,
        fileName: file.name,
        contentType: file.type || undefined,
        size: file.size,
      });
      toast.success(t("documentAdded"));
    } catch (error) {
      handleError(error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SidePanelSection
      title={t("measureDocuments")}
      action={
        <label
          className={buttonVariants({
            variant: "ghost",
            size: "xs",
            className: uploading ? "pointer-events-none opacity-50" : undefined,
          })}
        >
          <Upload />
          {t("measureAddFile")}
          <input
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      }
    >
      {documents && documents.length > 0 && (
        <ul className="space-y-1">
          {documents.map((document) => (
            <li
              key={document._id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                onClick={() =>
                  openFileViewer({
                    storageId: document.storageId,
                    name: document.fileName,
                    contentType: document.contentType ?? undefined,
                    size: document.size ?? undefined,
                    modifiedAt: document.createdAt,
                    url: document.url ?? undefined,
                  })
                }
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{document.fileName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {document.size ? formatFileSize(document.size) : "—"} ·{" "}
                    {formatDateTime(document.createdAt, locale)}
                  </span>
                </span>
              </button>
              {isManager && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tc("delete")}
                  onClick={() =>
                    void removeDocument({ documentId: document._id }).catch(handleError)
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SidePanelSection>
  );
}

export default function MeasuresPage() {
  return (
    <Suspense fallback={null}>
      <MeasuresContent />
    </Suspense>
  );
}
