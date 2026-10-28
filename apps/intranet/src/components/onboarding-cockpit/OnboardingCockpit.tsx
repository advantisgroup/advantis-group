"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import {
  followUpBucket,
  MILESTONES,
  type StatusConfig,
} from "@advantis/convex/performance/onboarding";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, Download, Eye, Flag, Inbox, Plus, Rocket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatIsoDate, matchesSearch } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CaseSheet } from "./CaseSheet";
import { CreateCaseDialog } from "./CreateCaseDialog";
import { DistributionPanel } from "./DistributionPanel";
import { FollowUpCalendar } from "./FollowUpCalendar";
import { ImportPanel } from "./ImportPanel";
import { PhaseBar } from "./StageOverview";
import { StatusEditor } from "./StatusEditor";
import {
  type CaseRow,
  caseDate,
  FollowUpDate,
  followUpDue,
  isOpen,
  StatusBadge,
  CustomerNumber,
  outcomeKind,
  StatusConfigProvider,
  useOutcomeLabel,
  useStatusConfig,
  useStatusName,
  todayIso,
  workOrder,
} from "./shared";

type Tab = "cases" | "prio" | "followUps" | "distribution" | "status" | "import" | "archive";
type KpiFilter = "open" | "prio" | "due" | "case" | "unassigned" | "done" | "all";
const ALL = "__all";
const NO_SITUATION = "__none_situation";
const SELF = "__self";
const NOBODY = "__none";

type Assignee = { userId: Id<"users">; name: string };

/**
 * Onboarding-Cockpit (own sidebar entry under Performance): the team's work
 * list. Admins see all cases, distribute them and import the Salesforce
 * report; everyone else (once `ONBOARDING_MODE=live`) only their own.
 */
export function OnboardingCockpit() {
  const t = useTranslations("OnboardingCockpit");
  const router = useRouter();
  const access = useQuery(api.performance.onboarding.me, {});
  const allowed = access?.access ?? false;
  /** "Ansicht als": a manager sees the cockpit exactly as this person does. */
  const [viewAs, setViewAs] = useState<Id<"users"> | null>(null);
  const realManage = access?.canManage ?? false;
  const canManage = realManage && !viewAs;

  useEffect(() => {
    if (access && !access.access) router.replace("/");
  }, [access, router]);

  const [tab, setTab] = useState<Tab>("cases");
  const [openId, setOpenId] = useState<Id<"onboardingCases"> | null>(null);
  const [creating, setCreating] = useState(false);
  const cases = useQuery(
    api.performance.onboarding.list,
    !allowed ? "skip" : viewAs ? { asUserId: viewAs } : {},
  );
  const archived = useQuery(
    api.performance.onboarding.list,
    allowed && canManage && tab === "archive" ? { archived: true } : "skip",
  );
  const assignees = useQuery(api.performance.onboarding.assignees, realManage ? {} : "skip");
  const statusConfig = useQuery(api.performance.onboarding.statusConfig, allowed ? {} : "skip");
  const [archiveView, setArchiveView] = useState<"archived" | "winback">("winback");
  const viewAsName = viewAs ? assignees?.find((a) => a.userId === viewAs)?.name : null;

  const today = todayIso();
  const order = useMemo(() => workOrder(today), [today]);
  const open = (cases ?? []).filter(isOpen);
  const prio = open.filter((c) => c.prio).sort(order);
  const followUps = open
    .filter((c) => c.nextFollowUp)
    .sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!));

  if (access === undefined || (allowed && cases === undefined)) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!allowed) return null;

  const tabs = [
    {
      value: "cases" as const,
      label: canManage ? t("tabs.cases") : t("tabs.myCases"),
      count: open.length,
    },
    { value: "prio" as const, label: t("tabs.prio"), count: prio.length },
    { value: "followUps" as const, label: t("tabs.followUps"), count: followUps.length },
    ...(canManage
      ? [
          { value: "distribution" as const, label: t("tabs.distribution") },
          { value: "status" as const, label: t("tabs.status") },
          { value: "import" as const, label: t("tabs.import") },
          {
            value: "archive" as const,
            label: t("tabs.archive"),
            count: (cases ?? []).filter((c) => c.status === "winback").length,
          },
        ]
      : []),
  ];

  return (
    <StatusConfigProvider config={statusConfig ? { outcomes: statusConfig.outcomes } : undefined}>
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeaderBar
          title={t("title")}
          description={canManage ? t("introManage") : t("introOwn")}
          icon={<Rocket className="size-4" />}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {realManage && !access.live && (
            <Badge variant="warning" title={t("adminsOnlyHint")} className="mr-auto">
              {t("adminsOnly")}
            </Badge>
          )}
          {realManage && (
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <Select
                value={viewAs ?? SELF}
                onValueChange={(v) => {
                  setViewAs(v === SELF ? null : (v as Id<"users">));
                  setTab("cases");
                }}
              >
                <SelectTrigger className="h-9 w-[240px]" aria-label={t("viewAs.label")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELF}>
                    {access.isAdmin ? t("viewAs.self") : t("viewAs.selfLead")}
                  </SelectItem>
                  {(assignees ?? [])
                    .filter((a) => a.member)
                    .map((a) => (
                      <SelectItem key={a.userId} value={a.userId}>
                        {t("viewAs.as", { name: a.name })}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!viewAs && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("create.button")}
            </Button>
          )}
        </div>
        {viewAs && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
            <span>{t("viewAs.banner", { name: viewAsName ?? "…" })}</span>
            <Button variant="outline" size="sm" onClick={() => setViewAs(null)}>
              {t("viewAs.end")}
            </Button>
          </div>
        )}
        <CountTabs tabs={tabs} value={tab} onChange={setTab} />

        {tab === "cases" && (
          <CasesView
            cases={cases ?? []}
            canManage={canManage}
            assignees={assignees}
            onOpen={setOpenId}
          />
        )}
        {tab === "prio" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{t("prioIntro")}</p>
              <ExportButton rows={prio} />
            </div>
            <CaseTable rows={prio} onOpen={setOpenId} empty={t("empty.prio")} />
          </section>
        )}
        {tab === "followUps" && (
          <FollowUpView rows={followUps} onOpen={setOpenId} canManage={canManage} />
        )}
        {tab === "distribution" && canManage && (
          <DistributionPanel cases={cases ?? []} people={assignees} isAdmin={access.isAdmin} />
        )}
        {tab === "status" && canManage && <StatusEditor />}
        {tab === "import" && canManage && <ImportPanel />}
        {tab === "archive" && canManage && (
          <section className="space-y-3">
            <CountTabs
              tabs={[
                {
                  value: "winback" as const,
                  label: t("archiveTabs.winback"),
                  count: (cases ?? []).filter((c) => c.status === "winback").length,
                },
                {
                  value: "archived" as const,
                  label: t("archiveTabs.archived"),
                  count: archived?.length,
                },
              ]}
              value={archiveView}
              onChange={setArchiveView}
            />
            {archiveView === "winback" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{t("winbackIntro")}</p>
                  <ExportButton rows={(cases ?? []).filter((c) => c.status === "winback")} />
                </div>
                <CaseTable
                  rows={(cases ?? [])
                    .filter((c) => c.status === "winback")
                    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))}
                  onOpen={setOpenId}
                  empty={t("empty.winback")}
                />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("archiveIntro")}</p>
                {archived === undefined ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <SelectableTable
                    rows={[...archived].sort(order)}
                    onOpen={setOpenId}
                    empty={t("empty.archive")}
                    archive
                  />
                )}
              </>
            )}
          </section>
        )}

        <CaseSheet
          caseId={openId}
          onOpenChange={(o) => !o && setOpenId(null)}
          assignees={assignees}
        />
        <CreateCaseDialog
          open={creating}
          onOpenChange={setCreating}
          canManage={canManage}
          assignees={assignees}
          onCreated={(id) => {
            setTab("cases");
            setOpenId(id);
          }}
        />
      </div>
    </StatusConfigProvider>
  );
}

// ------------------------------------------------------------ cases tab

function matchesKpi(c: CaseRow, filter: KpiFilter, today: string, config: StatusConfig): boolean {
  switch (filter) {
    case "all":
      return true;
    case "open":
      return isOpen(c);
    case "prio":
      return isOpen(c) && c.prio;
    case "due":
      return followUpDue(c, today);
    case "case":
      return isOpen(c) && outcomeKind(config, c) === "case";
    case "unassigned":
      return isOpen(c) && !c.assigneeUserId;
    case "done":
      return c.status === "done";
  }
}

/** A headline figure that filters the list when clicked. */
function KpiButton({
  label,
  value,
  active,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone?: "neutral" | "warn" | "critical";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-xl border border-border/70 bg-card px-4 py-3 text-left transition-colors hover:border-foreground/30",
        active && "border-foreground/40 bg-muted/50",
      )}
    >
      <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          value > 0 && tone === "warn" && "text-warn",
          value > 0 && tone === "critical" && "text-destructive",
        )}
      >
        {value}
      </span>
    </button>
  );
}

function CasesView({
  cases,
  canManage,
  assignees,
  onOpen,
}: {
  cases: CaseRow[];
  canManage: boolean;
  assignees: Assignee[] | undefined;
  onOpen: (id: Id<"onboardingCases">) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const [query, setQuery] = useState("");
  const [kpi, setKpi] = useState<KpiFilter>("open");
  const [status, setStatus] = useState(ALL);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [assignee, setAssignee] = useState(ALL);
  const today = todayIso();
  const config = useStatusConfig();

  if (cases.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-6 w-6" />}
        title={t("empty.noCasesTitle")}
        description={canManage ? t("empty.noCasesManage") : t("empty.noCasesOwn")}
      />
    );
  }

  const count = (f: KpiFilter) => cases.filter((c) => matchesKpi(c, f, today, config)).length;
  const rows = cases
    .filter((c) => {
      if (!matchesKpi(c, kpi, today, config)) return false;
      if (status !== ALL && c.status !== status) return false;
      if (outcome === NO_SITUATION && c.outcomePath.length > 0) return false;
      if (outcome && outcome !== NO_SITUATION && c.outcomePath[0] !== outcome) return false;
      if (
        assignee === NOBODY ? c.assigneeUserId : assignee !== ALL && c.assigneeUserId !== assignee
      )
        return false;
      return matchesSearch(query, c.customerNumber, c.assigneeName, c.reportOwner, c.note);
    })
    .sort(workOrder(today));

  const toggleKpi = (f: KpiFilter) => setKpi(kpi === f ? "all" : f);
  const filtered = query || kpi !== "open" || status !== ALL || outcome || assignee !== ALL;

  return (
    <div className="space-y-4">
      <PhaseBar
        cases={cases}
        active={status === ALL ? null : status}
        onPick={(phase) => {
          setStatus(phase ?? ALL);
          setKpi(phase ? "all" : "open");
        }}
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiButton
          label={t("kpi.open")}
          value={count("open")}
          active={kpi === "open"}
          onClick={() => toggleKpi("open")}
        />
        <KpiButton
          label={t("kpi.prio")}
          value={count("prio")}
          tone="critical"
          active={kpi === "prio"}
          onClick={() => toggleKpi("prio")}
        />
        <KpiButton
          label={t("kpi.followUpDue")}
          value={count("due")}
          tone="warn"
          active={kpi === "due"}
          onClick={() => toggleKpi("due")}
        />
        {canManage && (
          <KpiButton
            label={t("kpi.unassigned")}
            value={count("unassigned")}
            tone="warn"
            active={kpi === "unassigned"}
            onClick={() => toggleKpi("unassigned")}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("kpi.filterHint")}</p>

      {canManage && (
        <ConsultantTable
          cases={cases}
          active={assignee}
          onPick={(id) => {
            setAssignee(assignee === id ? ALL : id);
            setKpi("open");
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("filter.search")}
          className="h-9 min-w-[220px] flex-1"
        />
        <Select value={outcome ?? ALL} onValueChange={(v) => setOutcome(v === ALL ? null : v)}>
          <SelectTrigger className="h-9 w-[200px]" aria-label={t("situation.title")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filter.allSituations")}</SelectItem>
            <SelectItem value={NO_SITUATION}>{t("situation.none")}</SelectItem>
            {config.outcomes.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filter.allAssignees")}</SelectItem>
              <SelectItem value={NOBODY}>{t("filter.unassigned")}</SelectItem>
              {(assignees ?? [])
                .filter((a) => cases.some((c) => c.assigneeUserId === a.userId))
                .map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setKpi("open");
              setStatus(ALL);
              setOutcome(null);
              setAssignee(ALL);
            }}
          >
            {t("filter.reset")}
          </Button>
        )}
        <ExportButton rows={rows} />
      </div>

      {canManage ? (
        <SelectableTable
          rows={rows}
          onOpen={onOpen}
          empty={t("empty.filtered")}
          assignees={assignees}
        />
      ) : (
        <CaseTable rows={rows} onOpen={onOpen} empty={t("empty.filtered")} />
      )}
    </div>
  );
}

/** Admin overview: open, prio, due, cases opened and done per person,
 * with a workload bar. Clicking a row filters the list to that person. */
function ConsultantTable({
  cases,
  active,
  onPick,
}: {
  cases: CaseRow[];
  active: string;
  onPick: (id: string) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const today = todayIso();
  const config = useStatusConfig();
  const people = new Map<string, { name: string; rows: CaseRow[] }>();
  for (const c of cases) {
    const id = c.assigneeUserId ?? NOBODY;
    const name = c.assigneeName ?? t("case.nobody");
    const entry = people.get(id) ?? { name, rows: [] };
    entry.rows.push(c);
    people.set(id, entry);
  }
  const list = [...people.entries()]
    .map(([id, p]) => ({
      id,
      name: p.name,
      open: p.rows.filter(isOpen).length,
      prio: p.rows.filter((c) => isOpen(c) && c.prio).length,
      due: p.rows.filter((c) => followUpDue(c, today)).length,
      cards: p.rows.filter((c) => isOpen(c) && outcomeKind(config, c) === "case").length,
      done: p.rows.filter((c) => !isOpen(c)).length,
    }))
    .sort((a, b) => Number(a.id === NOBODY) - Number(b.id === NOBODY) || b.open - a.open);
  const max = Math.max(1, ...list.map((p) => p.open));

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{t("kpi.perConsultant")}</h2>
      <div className="overflow-x-auto rounded-xl border bg-card border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("kpi.consultant")}</TableHead>
              <TableHead className="text-right">{t("kpi.open")}</TableHead>
              <TableHead className="text-right">{t("prioBadge")}</TableHead>
              <TableHead className="text-right">{t("kpi.due")}</TableHead>
              <TableHead className="text-right">{t("kpi.caseOpened")}</TableHead>
              <TableHead className="text-right">{t("kpi.done")}</TableHead>
              <TableHead className="w-[28%]">{t("kpi.load")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((p) => (
              <TableRow
                key={p.id}
                className={cn("cursor-pointer", active === p.id && "bg-muted/60")}
                onClick={() => onPick(p.id)}
              >
                <TableCell className={cn("font-medium", p.id === NOBODY && "italic")}>
                  {p.name}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.open}</TableCell>
                <TableCell
                  className={cn("text-right tabular-nums", p.prio > 0 && "text-destructive")}
                >
                  {p.prio}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", p.due > 0 && "text-warn")}>
                  {p.due}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.cards}</TableCell>
                <TableCell className="text-right tabular-nums">{p.done}</TableCell>
                <TableCell>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((p.open / max) * 100)}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FollowUpView({
  rows,
  onOpen,
  canManage,
}: {
  rows: CaseRow[];
  onOpen: (id: Id<"onboardingCases">) => void;
  canManage: boolean;
}) {
  const t = useTranslations("OnboardingCockpit");
  const today = todayIso();
  const count = (b: string) =>
    rows.filter((c) => followUpBucket(c.nextFollowUp!, today) === b).length;
  const overdue = count("overdue");
  const todays = count("today");
  return (
    <section className="space-y-4">
      <KpiStrip>
        <Kpi label={t("kpi.overdue")} value={overdue} tone={overdue ? "critical" : "neutral"} />
        <Kpi label={t("kpi.today")} value={todays} tone={todays ? "warn" : "neutral"} />
        <Kpi label={t("kpi.week")} value={count("week")} />
        <Kpi label={t("kpi.later")} value={count("later")} />
      </KpiStrip>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("followUpIntro")}</p>
        <ExportButton rows={rows} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t("empty.followUps")} />
      ) : (
        <FollowUpCalendar rows={rows} onOpen={onOpen} showAssignee={canManage} />
      )}
    </section>
  );
}

// ----------------------------------------------------------------- export

/** Downloads the rows on screen as an .xlsx (one row per case). */
function ExportButton({ rows }: { rows: CaseRow[] }) {
  const t = useTranslations("OnboardingCockpit");
  const statusName = useStatusName();
  const outcomeLabel = useOutcomeLabel();
  const run = () => {
    const header = [
      t("col.number"),
      t("col.status"),
      t("phase.milestones"),
      t("situation.current"),
      t("situation.freetext"),
      t("col.assignee"),
      t("prioBadge"),
      t("col.followUp"),
      t("case.noteTitle"),
      t("case.accountStatus"),
      t("case.closeDate"),
      t("case.reportStatus"),
      t("case.reportOwner"),
      t("col.lastContact"),
    ];
    const data = rows.map((c) => [
      c.customerNumber,
      statusName(c.status),
      MILESTONES.filter((m) => c.milestones.includes(m))
        .map((m) => t(`steps.${m}`))
        .join(", "),
      outcomeLabel(c) ?? "",
      c.outcomeText ?? "",
      c.assigneeName ?? "",
      c.prio ? "Ja" : "",
      c.nextFollowUp
        ? `${c.nextFollowUp}${c.nextFollowUpTime ? ` ${c.nextFollowUpTime}` : ""}`
        : "",
      c.note ?? "",
      c.accountStatus ?? "",
      c.closeDate ?? "",
      c.reportStatus ?? "",
      c.reportOwner ?? "",
      c.lastContactAt ? new Date(c.lastContactAt).toISOString().slice(0, 10) : "",
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    sheet["!cols"] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, t("export.sheet"));
    XLSX.writeFile(book, `Onboarding-Cockpit_${todayIso()}.xlsx`);
    toast.success(t("export.done", { count: rows.length }));
  };
  return (
    <Button variant="outline" size="sm" onClick={run} disabled={rows.length === 0}>
      <Download className="mr-2 h-4 w-4" />
      {t("export.button")}
    </Button>
  );
}

// ----------------------------------------------------------------- tables

/** Admin table with row selection and the bulk bar (assign / archive). */
function SelectableTable({
  rows,
  onOpen,
  empty,
  assignees,
  archive = false,
}: {
  rows: CaseRow[];
  onOpen: (id: Id<"onboardingCases">) => void;
  empty: string;
  assignees?: Assignee[];
  archive?: boolean;
}) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const assignMany = useMutation(api.performance.onboarding.assignMany);
  const setArchived = useMutation(api.performance.onboarding.setArchived);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = new Set(rows.map((r) => r._id as string));
  const chosen = [...selected].filter((id) => visible.has(id)) as Id<"onboardingCases">[];

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const bulkAssign = async (value: string) => {
    try {
      const { changed } = await assignMany({
        caseIds: chosen,
        assigneeUserId: value === NOBODY ? null : (value as Id<"users">),
      });
      toast.success(t("assignDone", { count: changed }));
      setSelected(new Set());
    } catch (e) {
      handleError(e, t("case.saveError"));
    }
  };

  const bulkArchive = async () => {
    try {
      await setArchived({ caseIds: chosen, archived: !archive });
      toast.success(t(archive ? "unarchived" : "archived", { count: chosen.length }));
      setSelected(new Set());
    } catch (e) {
      handleError(e, t("case.saveError"));
    }
  };

  return (
    <div className="space-y-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm border-border/70">
          <span className="font-medium">{t("selected", { count: chosen.length })}</span>
          {!archive && (
            <Select value="" onValueChange={(v) => void bulkAssign(v)}>
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue placeholder={t("assignTo")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>{t("case.nobody")}</SelectItem>
                {(assignees ?? []).map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => void bulkArchive()}>
            {archive ? (
              <ArchiveRestore className="mr-2 h-4 w-4" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            {archive ? t("unarchiveSelected") : t("archiveSelected")}
          </Button>
        </div>
      )}
      <CaseTable
        rows={rows}
        onOpen={onOpen}
        empty={empty}
        selection={{
          isSelected: (id) => selected.has(id),
          toggle,
          allSelected: rows.length > 0 && chosen.length === rows.length,
          toggleAll: (on) => setSelected(on ? new Set(visible) : new Set()),
        }}
      />
    </div>
  );
}

function CaseTable({
  rows,
  onOpen,
  empty,
  selection,
}: {
  rows: CaseRow[];
  onOpen: (id: Id<"onboardingCases">) => void;
  empty: string;
  selection?: {
    isSelected: (id: string) => boolean;
    toggle: (id: string, on: boolean) => void;
    allSelected: boolean;
    toggleAll: (on: boolean) => void;
  };
}) {
  const outcomeLabel = useOutcomeLabel();
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  if (rows.length === 0) return <EmptyState title={empty} />;

  return (
    <div className="overflow-x-auto rounded-xl border bg-card border-border/70">
      <Table>
        <TableHeader>
          <TableRow>
            {selection && (
              <TableHead className="w-8">
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={selection.allSelected}
                  onCheckedChange={(v) => selection.toggleAll(v === true)}
                />
              </TableHead>
            )}
            <TableHead>{t("col.number")}</TableHead>
            <TableHead>{t("col.progress")}</TableHead>
            <TableHead>{t("col.assignee")}</TableHead>
            <TableHead>{t("col.followUp")}</TableHead>
            <TableHead>{t("col.lastContact")}</TableHead>
            <TableHead>{t("col.closeDate")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow
              key={c._id}
              className={cn("cursor-pointer", c.prio && isOpen(c) && "bg-destructive/[0.04]")}
              onClick={() => onOpen(c._id)}
            >
              {selection && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={t("selectRow")}
                    checked={selection.isSelected(c._id)}
                    onCheckedChange={(v) => selection.toggle(c._id, v === true)}
                  />
                </TableCell>
              )}
              <TableCell className="max-w-[320px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CustomerNumber number={c.customerNumber} className="font-medium" />
                  {c.prio && isOpen(c) && (
                    <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                      <Flag className="h-2.5 w-2.5" />
                      {t("prioBadge")}
                    </Badge>
                  )}
                </div>
                {c.note && (
                  <p className="truncate text-xs text-muted-foreground" title={c.note}>
                    {c.note}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex max-w-[280px] flex-col items-start gap-1">
                  <StatusBadge status={c.status} />
                  {outcomeLabel(c) && (
                    <span
                      className="w-full truncate text-xs text-muted-foreground"
                      title={outcomeLabel(c) ?? undefined}
                    >
                      {outcomeLabel(c)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {c.assigneeName ?? (
                  <span className="text-muted-foreground">{t("case.nobody")}</span>
                )}
              </TableCell>
              <TableCell>
                <FollowUpDate date={c.nextFollowUp} open={isOpen(c)} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                {c.lastContactAt ? (
                  <>
                    <span>{t(`contactKind.${c.lastContactKind as "reached"}`)}</span>
                    <span className="block text-muted-foreground">
                      {new Date(c.lastContactAt).toLocaleDateString(locale)} ·{" "}
                      {t("attempts", { count: c.contactAttempts })}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("never")}</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {caseDate(c) ? formatIsoDate(caseDate(c)!, locale) : "–"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
