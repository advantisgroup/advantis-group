"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type AbsenceType } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarArrowDown,
  CircleDashed,
  Clock,
  Pencil,
  Plane,
  Plus,
  Thermometer,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  ProviderBadge,
  ProviderInline,
} from "@/components/branding/ProviderMark";
import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import {
  addDaysIso,
  isoToday,
  rangesOverlap,
  workingDays,
} from "@/lib/absences";
import { formatDateTime, formatIsoDate, relativeTime } from "@/lib/format";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

type Status = "pending" | "approved" | "denied" | "cancelled";
type AbsenceRow = FunctionReturnType<typeof api.absences.myAbsences>[number];

const TYPE_ICONS: Record<AbsenceType, typeof Plane> = {
  vacation: Plane,
  sick: Thermometer,
  personal: UserRound,
  other: CircleDashed,
};

const CLOCKODO_TYPE_KEYS: Record<number, string> = {
  1: "regularHoliday",
  2: "specialLeave",
  3: "overtimeReduction",
  4: "sickDay",
  5: "sickChild",
  6: "education",
  7: "maternity",
  8: "homeOffice",
  9: "outOfOffice",
  10: "specialLeaveUnpaid",
  11: "sickUnpaid",
  12: "sickChildUnpaid",
  13: "quarantine",
  14: "military",
  15: "sicknessBenefit",
};

function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("Absences");
  const variant = {
    pending: "warning",
    approved: "success",
    denied: "destructive",
    cancelled: "muted",
  }[status] as "warning" | "success" | "destructive" | "muted";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

/** Clockodo mirror marker — explains why the row can't be edited here. */
function ClockodoBadge() {
  const t = useTranslations("Absences");
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="muted" className="gap-1">
            <ProviderBadge provider="clockodo" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {t("clockodoReadOnly")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RequestDialog({
  open,
  onOpenChange,
  editing,
  mine,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AbsenceRow | null;
  mine: AbsenceRow[];
}) {
  const t = useTranslations("Absences");
  const tc = useTranslations("Common");
  const create = useMutation(api.absences.createRequest);
  const update = useMutation(api.absences.updateRequest);
  const handleError = useErrorHandler();
  const [type, setType] = useState<AbsenceType>("vacation");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? "vacation");
    setStart(editing?.startDate ?? "");
    setEnd(editing?.endDate ?? "");
    setHalfDay(editing?.halfDay ?? false);
    setReason(editing?.reason ?? "");
  }, [open, editing]);

  const days =
    startDate && endDate && endDate >= startDate
      ? workingDays(startDate, endDate, halfDay)
      : null;

  const overlaps =
    !!startDate &&
    !!endDate &&
    mine.some(
      a =>
        a._id !== editing?._id &&
        (a.status === "pending" || a.status === "approved") &&
        rangesOverlap(a.startDate, a.endDate, startDate, endDate)
    );

  async function submit() {
    if (!startDate || !endDate) return;
    setBusy(true);
    try {
      if (editing) {
        await update({
          absenceId: editing._id,
          type,
          startDate,
          endDate,
          halfDay,
          reason: reason || undefined,
        });
        toast.success(t("requestUpdated"));
      } else {
        await create({
          type,
          startDate,
          endDate,
          halfDay,
          reason: reason || undefined,
        });
        toast.success(t("newRequest"));
      }
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? t("editRequest") : t("newRequest")}
          </DialogTitle>
          <DialogDescription>{t("newRequestHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>{t("type")}</Label>
            <Select value={type} onValueChange={v => setType(v as AbsenceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">{t("vacation")}</SelectItem>
                <SelectItem value="sick">{t("sick")}</SelectItem>
                <SelectItem value="personal">{t("personal")}</SelectItem>
                <SelectItem value="other">{t("other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("start")}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("end")}</Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={e => setEnd(e.target.value)}
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={halfDay}
                onCheckedChange={v => setHalfDay(!!v)}
              />
              {t("halfDay")}
            </label>
            {days !== null && days > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("workingDaysLabel", { count: days })}
              </p>
            )}
            {overlaps && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <TriangleAlert className="size-3.5 shrink-0" />
                {t("overlapWarning")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("reason")}{" "}
              <span className="font-normal text-muted-foreground">
                ({tc("optional")})
              </span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !startDate || !endDate}>
            {tc("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatsRow({ mine }: { mine: AbsenceRow[] | undefined }) {
  const t = useTranslations("Absences");
  const year = new Date().getFullYear();
  const stats = useMemo(() => {
    const inYear = (a: AbsenceRow) => a.startDate.startsWith(String(year));
    const rows = mine ?? [];
    const sum = (type: AbsenceType) =>
      rows
        .filter(a => a.status === "approved" && a.type === type && inYear(a))
        .reduce(
          (acc, a) => acc + workingDays(a.startDate, a.endDate, a.halfDay),
          0
        );
    return {
      vacation: sum("vacation"),
      sick: sum("sick"),
      pending: rows.filter(a => a.status === "pending").length,
    };
  }, [mine, year]);

  const items = [
    { label: t("statsVacation", { year }), value: stats.vacation, Icon: Plane },
    { label: t("statsSick", { year }), value: stats.sick, Icon: Thermometer },
    { label: t("statsPending"), value: stats.pending, Icon: Clock },
  ];
  return (
    <div
      className="grid grid-cols-3 gap-2 sm:gap-3"
      data-tour="tour-absences-stats"
    >
      {items.map(({ label, value, Icon }) => (
        <Card key={label}>
          <CardContent className="flex flex-col gap-1 p-3 sm:p-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </span>
            <span className="text-xl font-bold tabular-nums">{value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}

const STATUS_FILTERS: ("all" | Status)[] = [
  "all",
  "pending",
  "approved",
  "denied",
  "cancelled",
];
const TYPE_FILTERS: ("all" | AbsenceType)[] = [
  "all",
  "vacation",
  "sick",
  "personal",
  "other",
];

function DetailDialog({
  absence,
  onOpenChange,
}: {
  absence: AbsenceRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  if (!absence) return null;
  const clockodoTypeKey =
    absence.clockodoType !== undefined
      ? CLOCKODO_TYPE_KEYS[absence.clockodoType]
      : undefined;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t(absence.type)}
            {absence.source === "clockodo" && <ClockodoBadge />}
          </DialogTitle>
          <DialogDescription>
            {formatIsoDate(absence.startDate, locale)} –{" "}
            {formatIsoDate(absence.endDate, locale)}
            {absence.halfDay ? ` · ${t("halfDayShort")}` : ""} ·{" "}
            {t("workingDaysLabel", {
              count: workingDays(
                absence.startDate,
                absence.endDate,
                absence.halfDay
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("status")}</span>
            <StatusBadge status={absence.status} />
          </div>
          {clockodoTypeKey && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("clockodoType")}</span>
              <span>{t(`clockodoTypes.${clockodoTypeKey}`)}</span>
            </div>
          )}
          {absence.reason && (
            <div>
              <p className="text-muted-foreground">{t("reason")}</p>
              <p>{absence.reason}</p>
            </div>
          )}
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="flex items-center justify-between gap-2">
              <span>{t("requested")}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(absence.createdAt, locale)}
              </span>
            </p>
            {absence.reviewedAt &&
              absence.reviewerName &&
              (absence.status === "approved" ||
                absence.status === "denied") && (
                <p className="flex items-center justify-between gap-2">
                  <span>
                    {t(
                      absence.status === "approved" ? "approvedBy" : "deniedBy",
                      { name: absence.reviewerName }
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(absence.reviewedAt, locale)}
                  </span>
                </p>
              )}
            {absence.decisionNote && (
              <p className="text-xs text-muted-foreground">
                {t("decisionNoteLabel")}: {absence.decisionNote}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MyAbsences({
  mine,
  onEdit,
}: {
  mine: AbsenceRow[] | undefined;
  onEdit: (absence: AbsenceRow) => void;
}) {
  const t = useTranslations("Absences");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const cancel = useMutation(api.absences.cancel);
  const handleError = useErrorHandler();
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | AbsenceType>("all");
  const [detail, setDetail] = useState<AbsenceRow | null>(null);

  async function onCancel(id: Id<"absences">) {
    const ok = await confirm({
      title: t("cancelRequest"),
      description: tc("deleteWarning"),
      confirmLabel: t("cancelRequest"),
      cancelLabel: tc("close"),
    });
    if (ok) {
      try {
        await cancel({ absenceId: id });
      } catch (e) {
        handleError(e);
      }
    }
  }

  const byYear = useMemo(() => {
    const rows = (mine ?? []).filter(
      a =>
        (statusFilter === "all" || a.status === statusFilter) &&
        (typeFilter === "all" || a.type === typeFilter)
    );
    const groups = new Map<string, AbsenceRow[]>();
    for (const a of rows) {
      const year = a.startDate.slice(0, 4);
      const list = groups.get(year) ?? [];
      list.push(a);
      groups.set(year, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [mine, statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-1.5"
        data-tour="tour-absences-filters"
      >
        {STATUS_FILTERS.map(s => (
          <Pill
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? t("filterAll") : t(s)}
          </Pill>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        {TYPE_FILTERS.map(ty => (
          <Pill
            key={ty}
            active={typeFilter === ty}
            onClick={() => setTypeFilter(ty)}
          >
            {ty === "all" ? t("filterAll") : t(ty)}
          </Pill>
        ))}
      </div>

      <div className="space-y-4" data-tour="tour-absences-list">
        {byYear.length === 0 && mine !== undefined && (
          <EmptyState icon={<Plane />} title={t("noAbsences")} />
        )}
        {byYear.map(([year, rows]) => (
          <div key={year} className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {year}
            </h2>
            {rows.map(a => {
              const Icon = TYPE_ICONS[a.type];
              return (
                <Card
                  key={a._id}
                  className="cursor-pointer transition-colors hover:border-border"
                  onClick={() => setDetail(a)}
                >
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{t(a.type)}</span>
                          {a.source === "clockodo" && <ClockodoBadge />}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatIsoDate(a.startDate, locale)} –{" "}
                          {formatIsoDate(a.endDate, locale)} ·{" "}
                          {t("workingDaysLabel", {
                            count: workingDays(
                              a.startDate,
                              a.endDate,
                              a.halfDay
                            ),
                          })}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-2 self-end sm:self-auto"
                      onClick={e => e.stopPropagation()}
                    >
                      <StatusBadge status={a.status} />
                      {a.source === "intranet" && a.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("editRequest")}
                          onClick={() => onEdit(a)}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {a.source === "intranet" &&
                        (a.status === "pending" || a.status === "approved") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void onCancel(a._id)}
                          >
                            {t("cancelRequest")}
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))}
      </div>
      <DetailDialog
        absence={detail}
        onOpenChange={open => !open && setDetail(null)}
      />
    </div>
  );
}

/** Manager glance: approved absences hitting the team in the next two weeks. */
function WhosOut() {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const today = isoToday();
  const out = useQuery(api.absences.listForCalendar, {
    start: today,
    end: addDaysIso(today, 14),
  });

  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("whosOut")}
      </p>
      {out && out.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nobodyOut")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {out?.map(a => (
            <Badge key={a._id} variant="muted" className="gap-1.5 font-normal">
              <span className="font-medium">{a.userName}</span>
              {formatIsoDate(a.startDate, locale)} –{" "}
              {formatIsoDate(a.endDate, locale)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function DenyDialog({
  target,
  onClose,
}: {
  target: { absenceId: Id<"absences">; userName: string } | null;
  onClose: () => void;
}) {
  const t = useTranslations("Absences");
  const tc = useTranslations("Common");
  const deny = useMutation(api.absences.deny);
  const handleError = useErrorHandler();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setNote("");
  }, [target]);

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      await deny({ absenceId: target.absenceId, note: note || undefined });
      toast.success(t("denied"));
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("denyTitle")}</DialogTitle>
          <DialogDescription>
            {target ? t("denyHint", { name: target.userName }) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>
            {t("note")}{" "}
            <span className="font-normal text-muted-foreground">
              ({tc("optional")})
            </span>
          </Label>
          <Textarea value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {t("deny")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Approvals() {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const pending = useQuery(api.absences.pendingForApproval);
  const approve = useMutation(api.absences.approve);
  const handleError = useErrorHandler();
  const [denyTarget, setDenyTarget] = useState<{
    absenceId: Id<"absences">;
    userName: string;
  } | null>(null);

  async function onApprove(absenceId: Id<"absences">) {
    try {
      await approve({ absenceId });
      toast.success(t("approved"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <div className="space-y-4">
      <WhosOut />
      {pending && pending.length === 0 ? (
        <EmptyState icon={<Clock />} title={t("noPending")} />
      ) : (
        <div className="space-y-2.5">
          {pending?.map(a => (
            <Card key={a._id} className="transition-colors hover:border-border">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="font-medium">{a.userName}</span>
                  {a.userDepartment && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {a.userDepartment}
                    </span>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {t(a.type)} · {formatIsoDate(a.startDate, locale)} –{" "}
                    {formatIsoDate(a.endDate, locale)} ·{" "}
                    {t("workingDaysLabel", {
                      count: workingDays(a.startDate, a.endDate, a.halfDay),
                    })}
                  </p>
                  {a.reason && (
                    <p className="text-xs text-muted-foreground">{a.reason}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2 self-end sm:self-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDenyTarget({ absenceId: a._id, userName: a.userName })
                    }
                  >
                    {t("deny")}
                  </Button>
                  <Button size="sm" onClick={() => void onApprove(a._id)}>
                    {t("approve")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <DenyDialog target={denyTarget} onClose={() => setDenyTarget(null)} />
    </div>
  );
}

export default function AbsencesPage() {
  const t = useTranslations("Absences");
  const isManager = useIsManager();
  const mine = useQuery(api.absences.myAbsences);
  const syncStatus = useQuery(api.absences.clockodoSyncStatus);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AbsenceRow | null>(null);

  // Deep link from the dashboard quick action: /absences?new=1 opens the
  // request dialog straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== null) {
      // window.location is only available post-mount; this is a one-time
      // sync from URL state, not a case of deriving state from props.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(null);
      setDialogOpen(true);
      window.history.replaceState(null, "", "/absences");
    }
  }, []);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (absence: AbsenceRow) => {
    setEditing(absence);
    setDialogOpen(true);
  };

  function exportIcs() {
    const approved = (mine ?? []).filter(a => a.status === "approved");
    const ics = buildIcs(
      t("title"),
      approved.map(a => ({
        uid: a._id,
        title: `${t(a.type)}${a.halfDay ? ` (${t("halfDayShort")})` : ""}`,
        startDate: a.startDate,
        endDate: a.endDate,
        description: a.reason,
      }))
    );
    downloadIcs("absences.ics", ics);
    toast.success(t("exported"));
  }

  const syncLine = syncStatus?.lastRunAt ? (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ProviderInline provider="clockodo" />
      {relativeTime(syncStatus.lastRunAt) === "now"
        ? t("syncedJustNow")
        : t("lastSynced", { time: relativeTime(syncStatus.lastRunAt) })}
    </p>
  ) : null;

  const mineSection = (
    <div className="space-y-4">
      <StatsRow mine={mine} />
      <MyAbsences mine={mine} onEdit={openEdit} />
      {syncLine}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        tourCheckpoint="absences"
        action={
          <div className="flex items-center gap-2">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("exportIcs")}
                    onClick={exportIcs}
                    disabled={!mine?.some(a => a.status === "approved")}
                  >
                    <CalendarArrowDown />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("exportIcs")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button onClick={openNew} data-tour="tour-absences-request">
              <Plus className="mr-2 h-4 w-4" />
              {t("newRequest")}
            </Button>
          </div>
        }
      />
      {isManager ? (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">{t("myRequests")}</TabsTrigger>
            <TabsTrigger value="approvals" data-tour="tour-absences-approvals">
              {t("approvals")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mine">{mineSection}</TabsContent>
          <TabsContent value="approvals">
            <Approvals />
          </TabsContent>
        </Tabs>
      ) : (
        mineSection
      )}

      <Button
        className="fixed bottom-24 right-4 z-40 size-12 rounded-full shadow-lg md:hidden"
        aria-label={t("newRequest")}
        onClick={openNew}
      >
        <Plus className="size-5" />
      </Button>

      <RequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        mine={mine ?? []}
      />
    </div>
  );
}
