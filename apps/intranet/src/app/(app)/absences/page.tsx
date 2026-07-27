"use client";

import { type ReactNode, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type AbsenceType } from "@advantis/types";
import { useQuery } from "convex/react";
import {
  CalendarArrowDown,
  CircleDashed,
  Clock,
  Plane,
  Thermometer,
  UserRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ProviderBadge, ProviderInline } from "@/components/branding/ProviderMark";
import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { addDaysIso, isoToday, workingDays } from "@/lib/absences";
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
        <TooltipContent className="max-w-64">{t("clockodoReadOnly")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
        .filter((a) => a.status === "approved" && a.type === type && inYear(a))
        .reduce((acc, a) => acc + workingDays(a.startDate, a.endDate, a.halfDay), 0);
    return {
      vacation: sum("vacation"),
      sick: sum("sick"),
      pending: rows.filter((a) => a.status === "pending").length,
    };
  }, [mine, year]);

  const items = [
    { label: t("statsVacation", { year }), value: stats.vacation, Icon: Plane },
    { label: t("statsSick", { year }), value: stats.sick, Icon: Thermometer },
    { label: t("statsPending"), value: stats.pending, Icon: Clock },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3" data-tour="tour-absences-stats">
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
          : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

const STATUS_FILTERS: ("all" | Status)[] = ["all", "pending", "approved", "denied", "cancelled"];
const TYPE_FILTERS: ("all" | AbsenceType)[] = ["all", "vacation", "sick", "personal", "other"];

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
    absence.clockodoType !== undefined ? CLOCKODO_TYPE_KEYS[absence.clockodoType] : undefined;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t(absence.type)}
            {absence.source === "clockodo" && <ClockodoBadge />}
          </DialogTitle>
          <DialogDescription>
            {formatIsoDate(absence.startDate, locale)} – {formatIsoDate(absence.endDate, locale)}
            {absence.halfDay ? ` · ${t("halfDayShort")}` : ""} ·{" "}
            {t("workingDaysLabel", {
              count: workingDays(absence.startDate, absence.endDate, absence.halfDay),
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
              (absence.status === "approved" || absence.status === "denied") && (
                <p className="flex items-center justify-between gap-2">
                  <span>
                    {t(absence.status === "approved" ? "approvedBy" : "deniedBy", {
                      name: absence.reviewerName,
                    })}
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

function MyAbsences({ mine }: { mine: AbsenceRow[] | undefined }) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | AbsenceType>("all");
  const [detail, setDetail] = useState<AbsenceRow | null>(null);

  const byYear = useMemo(() => {
    const rows = (mine ?? []).filter(
      (a) =>
        (statusFilter === "all" || a.status === statusFilter) &&
        (typeFilter === "all" || a.type === typeFilter),
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
      <div className="flex flex-wrap items-center gap-1.5" data-tour="tour-absences-filters">
        {STATUS_FILTERS.map((s) => (
          <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s === "all" ? t("filterAll") : t(s)}
          </Pill>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        {TYPE_FILTERS.map((ty) => (
          <Pill key={ty} active={typeFilter === ty} onClick={() => setTypeFilter(ty)}>
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
            {rows.map((a) => {
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
                          {formatIsoDate(a.startDate, locale)} – {formatIsoDate(a.endDate, locale)}{" "}
                          ·{" "}
                          {t("workingDaysLabel", {
                            count: workingDays(a.startDate, a.endDate, a.halfDay),
                          })}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-2 self-end sm:self-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <StatusBadge status={a.status} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))}
      </div>
      <DetailDialog absence={detail} onOpenChange={(open) => !open && setDetail(null)} />
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
          {out?.map((a) => (
            <Badge key={a._id} variant="muted" className="gap-1.5 font-normal">
              <span className="font-medium">{a.userName}</span>
              {formatIsoDate(a.startDate, locale)} – {formatIsoDate(a.endDate, locale)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AbsencesPage() {
  const t = useTranslations("Absences");
  const isManager = useIsManager();
  const mine = useQuery(api.absences.myAbsences);
  const syncStatus = useQuery(api.absences.clockodoSyncStatus);

  function exportIcs() {
    const approved = (mine ?? []).filter((a) => a.status === "approved");
    const ics = buildIcs(
      t("title"),
      approved.map((a) => ({
        uid: a._id,
        title: `${t(a.type)}${a.halfDay ? ` (${t("halfDayShort")})` : ""}`,
        startDate: a.startDate,
        endDate: a.endDate,
        description: a.reason,
      })),
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

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        tourCheckpoint="absences"
        action={
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("exportIcs")}
                  onClick={exportIcs}
                  disabled={!mine?.some((a) => a.status === "approved")}
                >
                  <CalendarArrowDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("exportIcs")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
      />
      <div className="space-y-4">
        {isManager && <WhosOut />}
        <StatsRow mine={mine} />
        <MyAbsences mine={mine} />
        {syncLine}
      </div>
    </div>
  );
}
