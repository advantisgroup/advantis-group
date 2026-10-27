"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { followUpBucket, ONBOARDING_STATUSES } from "@advantis/convex/performance/onboarding";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, Flag, Inbox, Rocket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { ImportPanel } from "./ImportPanel";
import {
  type CaseRow,
  FollowUpDate,
  followUpDue,
  isOpen,
  StatusBadge,
  todayIso,
  workOrder,
} from "./shared";

type Tab = "cases" | "prio" | "followUps" | "import" | "archive";
const ALL = "__all";
const OPEN = "__open";
const NOBODY = "__none";

/**
 * Onboarding-Cockpit (own sidebar entry under Performance): the team's work list. Admins see all
 * cases, distribute them and import the Salesforce report; everyone else
 * (once `ONBOARDING_MODE=live`) only their own.
 */
export function OnboardingCockpit() {
  const t = useTranslations("OnboardingCockpit");
  const router = useRouter();
  const access = useQuery(api.performance.onboarding.me, {});
  const allowed = access?.access ?? false;
  const canManage = access?.canManage ?? false;

  useEffect(() => {
    if (access && !access.access) router.replace("/");
  }, [access, router]);

  const [tab, setTab] = useState<Tab>("cases");
  const [openId, setOpenId] = useState<Id<"onboardingCases"> | null>(null);
  const cases = useQuery(api.performance.onboarding.list, allowed ? {} : "skip");
  const archived = useQuery(
    api.performance.onboarding.list,
    allowed && canManage && tab === "archive" ? { archived: true } : "skip",
  );
  const assignees = useQuery(api.performance.onboarding.assignees, canManage ? {} : "skip");

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
    { value: "cases" as const, label: t("tabs.cases"), count: open.length },
    { value: "prio" as const, label: t("tabs.prio"), count: prio.length },
    { value: "followUps" as const, label: t("tabs.followUps"), count: followUps.length },
    ...(canManage
      ? [
          { value: "import" as const, label: t("tabs.import") },
          { value: "archive" as const, label: t("tabs.archive") },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeaderBar
        title={t("title")}
        description={canManage ? t("introManage") : t("introOwn")}
        icon={<Rocket className="size-4" />}
      />
      {canManage && !access.live && (
        <div className="flex justify-end">
          <Badge variant="warning" title={t("adminsOnlyHint")}>
            {t("adminsOnly")}
          </Badge>
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
          <p className="text-sm text-muted-foreground">{t("prioIntro")}</p>
          <CaseTable rows={prio} onOpen={setOpenId} empty={t("empty.prio")} />
        </section>
      )}
      {tab === "followUps" && <FollowUpView rows={followUps} onOpen={setOpenId} />}
      {tab === "import" && canManage && <ImportPanel />}
      {tab === "archive" && canManage && (
        <section className="space-y-3">
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
        </section>
      )}

      <CaseSheet
        caseId={openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        assignees={assignees}
      />
    </div>
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
  assignees: { userId: Id<"users">; name: string }[] | undefined;
  onOpen: (id: Id<"onboardingCases">) => void;
}) {
  const t = useTranslations("OnboardingCockpit");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(OPEN);
  const [assignee, setAssignee] = useState(ALL);
  const today = todayIso();

  const open = cases.filter(isOpen);
  const rows = cases
    .filter((c) => {
      if (status === OPEN ? !isOpen(c) : status !== ALL && c.status !== status) return false;
      if (
        assignee === NOBODY ? c.assigneeUserId : assignee !== ALL && c.assigneeUserId !== assignee
      )
        return false;
      return matchesSearch(query, c.name, c.customerNumber, c.assigneeName, c.reportOwner);
    })
    .sort(workOrder(today));

  const due = open.filter((c) => followUpDue(c, today)).length;
  const prio = open.filter((c) => c.prio).length;
  const unassigned = open.filter((c) => !c.assigneeUserId).length;
  const gone = open.filter((c) => !c.inReport).length;

  if (cases.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-6 w-6" />}
        title={t("empty.noCasesTitle")}
        description={canManage ? t("empty.noCasesManage") : t("empty.noCasesOwn")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <KpiStrip>
        <Kpi label={t("kpi.open")} value={open.length} />
        <Kpi label={t("kpi.prio")} value={prio} tone={prio ? "critical" : "neutral"} />
        <Kpi label={t("kpi.followUpDue")} value={due} tone={due ? "warn" : "neutral"} />
        {canManage ? (
          <Kpi
            label={gone ? t("kpi.notInReport") : t("kpi.unassigned")}
            value={gone || unassigned}
            tone={gone || unassigned ? "warn" : "neutral"}
            hint={gone ? `${t("kpi.unassigned")}: ${unassigned}` : undefined}
          />
        ) : (
          <Kpi label={t("kpi.done")} value={cases.length - open.length} />
        )}
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("filter.search")}
          className="h-9 min-w-[220px] flex-1"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OPEN}>{t("filter.openOnly")}</SelectItem>
            <SelectItem value={ALL}>{t("filter.allStatuses")}</SelectItem>
            {ONBOARDING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
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
        {(query || status !== OPEN || assignee !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setStatus(OPEN);
              setAssignee(ALL);
            }}
          >
            {t("filter.reset")}
          </Button>
        )}
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

function FollowUpView({
  rows,
  onOpen,
}: {
  rows: CaseRow[];
  onOpen: (id: Id<"onboardingCases">) => void;
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
      <p className="text-sm text-muted-foreground">{t("followUpIntro")}</p>
      <CaseTable rows={rows} onOpen={onOpen} empty={t("empty.followUps")} />
    </section>
  );
}

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
  assignees?: { userId: Id<"users">; name: string }[];
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
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
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
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  if (rows.length === 0) return <EmptyState title={empty} />;

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
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
            <TableHead>{t("col.customer")}</TableHead>
            <TableHead>{t("col.number")}</TableHead>
            <TableHead>{t("col.status")}</TableHead>
            <TableHead>{t("col.assignee")}</TableHead>
            <TableHead>{t("col.followUp")}</TableHead>
            <TableHead>{t("col.lastContact")}</TableHead>
            <TableHead>{t("col.reportDate")}</TableHead>
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
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{c.name}</span>
                  {c.prio && isOpen(c) && (
                    <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                      <Flag className="h-2.5 w-2.5" />
                      {t("prioBadge")}
                    </Badge>
                  )}
                  {!c.inReport && !c.archived && (
                    <Badge variant="muted" className="px-1.5 py-0 text-[10px]">
                      {t("notInReportBadge")}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="tabular-nums">{c.customerNumber}</TableCell>
              <TableCell>
                <StatusBadge status={c.status} />
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
                {c.reportDate ? formatIsoDate(c.reportDate, locale) : "–"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
