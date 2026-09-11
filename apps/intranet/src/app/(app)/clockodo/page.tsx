"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import {
  CalendarArrowDown,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Coffee,
  Link2Off,
  Pencil,
  Plane,
  Plus,
  Play,
  Search,
  Square,
  Thermometer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AbsenceTypeLegend } from "@/components/clockodo/AbsenceTypeLegend";
import { ClockodoAdminPanel } from "@/components/clockodo/ClockodoAdminPanel";
import { ClockStartPicker } from "@/components/clockodo/ClockStartPicker";
import { ClockStatusGradient } from "@/components/clockodo/ClockStatusGradient";
import { DateBadge } from "@/components/clockodo/DateBadge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PersonLink } from "@/components/profile/PersonLink";
import { useCurrentUser, useHasCapability } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { Textarea } from "@/components/ui/textarea";
import { addDaysIso, isoToday, mondayOfWeek, rangesOverlap, workingDays } from "@/lib/absences";
import {
  type AbsenceStatus,
  type AbsenceType,
  type CalendarAbsence,
  type MyAbsence,
  type PendingApproval,
  setAbsenceApprovalStatus,
  useAbsencesCalendar,
  useMyAbsences,
  usePendingAbsenceCount,
  usePendingApprovals,
} from "@/lib/absences-api";
import {
  clockStatusClassName,
  elapsedSince,
  useClockodoActions,
  useClockodoClock,
} from "@/lib/clockodo-clock";
import { deleteClockEntry, type ClockEntry, useClockEntries } from "@/lib/clockodo-entries-api";
import { useDesignPreview } from "@/lib/design-preview";
import { formatIsoDate } from "@/lib/format";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { useEdenApi } from "@/lib/eden";
import { cn } from "@/lib/utils";

type ClockodoSection = "dashboard" | "timetable" | "planner" | "requests" | "approvals" | "admin";

/** requests/approvals/planner share one "Absences" top-level tab (see
 * layout.tsx) — this small in-page pill lets you switch between them
 * without needing 3 separate top-level tabs, which is what made the
 * mobile bottom-nav overflow with a full manager's tab set. */
const ABSENCE_SUB_SECTIONS: {
  value: "requests" | "approvals" | "planner";
  labelKey: "requests" | "approvals" | "planner";
}[] = [
  { value: "requests", labelKey: "requests" },
  { value: "approvals", labelKey: "approvals" },
  { value: "planner", labelKey: "planner" },
];

function AbsencesSubNav({
  active,
  canManageClockodo,
  onNavigate,
}: {
  active: "requests" | "approvals" | "planner";
  canManageClockodo: boolean;
  onNavigate: (section: ClockodoSection) => void;
}) {
  const t = useTranslations("Absences");
  const refreshed = useDesignPreview() === "refreshed";
  const items = ABSENCE_SUB_SECTIONS.filter(
    (item) => item.value !== "approvals" || canManageClockodo,
  );

  if (refreshed) {
    return (
      <Segmented
        value={active}
        onChange={onNavigate}
        options={items.map((item) => ({
          value: item.value,
          label: t(`section.${item.labelKey}`),
        }))}
      />
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {items.map((item) => (
        <Button
          key={item.value}
          variant={active === item.value ? "default" : "ghost"}
          size="sm"
          className="shrink-0"
          onClick={() => onNavigate(item.value)}
        >
          {t(`section.${item.labelKey}`)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Isolates one independently-fetched widget so its own crash shows a small
 * inline "this part failed" card instead of taking the rest of the page
 * (other widgets, the tab bar) down with it.
 */
function SectionBoundary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={({ error, reset }) => (
        <ErrorFallback
          title={title}
          description={error.message}
          className="min-h-0 py-6"
          onRetry={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/** Color-coded by absence type to match Clockodo's own convention (green
 * for vacation, blue for sick) rather than a generic red for "sick". Uses a
 * soft diagonal gradient rather than a flat tint so badges/chips have some
 * depth instead of reading as solid color swatches. */
const TYPE_STYLE: Record<
  AbsenceType,
  { icon: typeof Plane; className: string; barClassName: string; accent: string }
> = {
  vacation: {
    icon: Plane,
    className:
      "bg-gradient-to-br from-emerald-400/30 to-emerald-500/10 text-emerald-700 dark:text-emerald-300 refreshed:bg-none refreshed:bg-emerald-500/15",
    barClassName:
      "bg-gradient-to-r from-emerald-500 to-emerald-500/70 refreshed:bg-none refreshed:bg-emerald-500",
    accent: "var(--color-emerald-500)",
  },
  sick: {
    icon: Thermometer,
    className:
      "bg-gradient-to-br from-sky-400/30 to-sky-500/10 text-sky-700 dark:text-sky-300 refreshed:bg-none refreshed:bg-sky-500/15",
    barClassName:
      "bg-gradient-to-r from-sky-500 to-sky-500/70 refreshed:bg-none refreshed:bg-sky-500",
    accent: "var(--color-sky-500)",
  },
  personal: {
    icon: CircleDashed,
    className:
      "bg-gradient-to-br from-violet-400/30 to-violet-500/10 text-violet-700 dark:text-violet-300 refreshed:bg-none refreshed:bg-violet-500/15",
    barClassName:
      "bg-gradient-to-r from-violet-500 to-violet-500/70 refreshed:bg-none refreshed:bg-violet-500",
    accent: "var(--color-violet-500)",
  },
  other: {
    icon: CircleDashed,
    className:
      "bg-gradient-to-br from-amber-400/30 to-amber-500/10 text-amber-700 dark:text-amber-300 refreshed:bg-none refreshed:bg-amber-500/15",
    barClassName:
      "bg-gradient-to-r from-amber-500 to-amber-500/70 refreshed:bg-none refreshed:bg-amber-500",
    accent: "var(--color-amber-500)",
  },
};

const ABSENCE_TYPES = Object.keys(TYPE_STYLE) as AbsenceType[];

const CLOCKODO_ABSENCE_GROUPS = [
  { key: "timeOff", types: [1, 2, 3, 10] },
  { key: "specialLeave", types: [6, 14, 7, 13] },
  { key: "sickness", types: [4, 5, 11, 12, 15] },
  { key: "workplace", types: [8, 9] },
] as const;
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

function formatClockTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function statusVariant(status: AbsenceStatus): "warning" | "success" | "destructive" | "muted" {
  const variants: Record<AbsenceStatus, "warning" | "success" | "destructive" | "muted"> = {
    pending: "warning",
    approved: "success",
    denied: "destructive",
    cancelled: "muted",
  };
  return variants[status];
}

const STATUS_ACCENT: Record<AbsenceStatus, string> = {
  pending: "var(--warn)",
  approved: "var(--ok)",
  denied: "var(--destructive)",
  cancelled: "var(--muted-foreground)",
};

const ABSENCE_STATUSES = Object.keys(STATUS_ACCENT) as AbsenceStatus[];

function AbsenceStatusBadge({ status }: { status: AbsenceStatus }) {
  const t = useTranslations("Absences");
  const refreshed = useDesignPreview() === "refreshed";
  if (!refreshed) return <Badge variant={statusVariant(status)}>{t(status)}</Badge>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        status === "cancelled" && "text-muted-foreground",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: STATUS_ACCENT[status] }}
      />
      {t(status)}
    </span>
  );
}

function AbsenceTypeLabel({ type }: { type: AbsenceType }) {
  const t = useTranslations("Absences");
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: TYPE_STYLE[type].accent }}
      />
      <span className="truncate">{t(type)}</span>
    </span>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 rounded-md px-3 py-1 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-card text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CalendarBar({
  absence,
  start,
  end,
}: {
  absence: CalendarAbsence;
  start: string;
  end: string;
}) {
  const total = Math.max(
    1,
    Math.round(
      (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1,
  );
  const first = absence.startDate < start ? start : absence.startDate;
  const last = absence.endDate > end ? end : absence.endDate;
  const offset = Math.round(
    (new Date(`${first}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  const length =
    Math.round(
      (new Date(`${last}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  return (
    <span
      className={cn(
        "absolute top-1/2 h-5 -translate-y-1/2 rounded-sm",
        TYPE_STYLE[absence.type].barClassName,
      )}
      style={{
        left: `${(offset / total) * 100}%`,
        width: `${Math.max((length / total) * 100, 2)}%`,
      }}
    />
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof Plane;
  accent: string;
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className={cn("grid size-9 place-items-center rounded-md", accent)}>
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function AbsencePill({ absence }: { absence: MyAbsence }) {
  const t = useTranslations("Absences");
  const style = TYPE_STYLE[absence.type];
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <DateBadge date={absence.startDate} className={style.className} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{t(absence.type)}</p>
          <p className="text-xs text-muted-foreground">
            {absence.startDate} - {absence.endDate}
          </p>
        </div>
      </div>
      <AbsenceStatusBadge status={absence.status} />
    </div>
  );
}

/** Shown in place of a personal-account widget (the clock, the timetable
 * grid) for someone who reached /clockodo via team access (manager or
 * view_clockodo_team) rather than their own linked Clockodo account —
 * otherwise the clock button spins forever waiting on a 403, and the
 * timetable grid renders a confusingly-empty week that looks like "nothing
 * scheduled" rather than "no personal account to show". */
function NoPersonalClockodoAccount({ hint }: { hint: string }) {
  const t = useTranslations("Absences");
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
        <span className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
          <Link2Off className="size-5" />
        </span>
        <p className="font-medium">{t("noPersonalAccountTitle")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ClockControl() {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const { state: clock, now, refresh } = useClockodoClock(!!user.clockodoUserId);
  const actions = useClockodoActions(clock, refresh);
  const refreshed = useDesignPreview() === "refreshed";

  if (!user.clockodoUserId) {
    return <NoPersonalClockodoAccount hint={t("noPersonalAccountClockHint")} />;
  }

  const working = clock?.status === "working";
  const duration = clock ? elapsedSince(clock.since, now) : null;
  const detail = !clock
    ? t("clockReady")
    : clock.status === "working"
      ? t("clockStatus.working", { duration: duration ?? "" })
      : clock.status === "break"
        ? t("clockStatus.break", { duration: duration ?? "" })
        : t("clockStatus.clockedOut");

  return (
    <>
      <Card className="relative overflow-hidden border-border/70 shadow-none">
        {!refreshed && <ClockStatusGradient status={clock?.status ?? null} />}
        <CardContent className="relative z-10 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "relative grid size-10 place-items-center rounded-md",
                clock ? clockStatusClassName(clock.status) : "bg-muted text-muted-foreground",
              )}
            >
              <Clock3 className="size-5" />
              {working && (
                <span className="absolute right-0.5 top-0.5 size-2 animate-pulse rounded-full bg-emerald-500" />
              )}
            </span>
            <div>
              <p className="font-medium">{clock?.accountName ?? t("clockLoading")}</p>
              <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
          </div>
          {working ? (
            <Button variant="outline" onClick={() => void actions.stop()} disabled={actions.busy}>
              <Square className="size-4" />
              {t("stopClock")}
            </Button>
          ) : (
            <Button onClick={() => void actions.openStart()} disabled={!clock || actions.busy}>
              <Play className="size-4" />
              {t("startClock")}
            </Button>
          )}
        </CardContent>
      </Card>
      <Dialog open={actions.pickerOpen} onOpenChange={actions.setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("startClock")}</DialogTitle>
          </DialogHeader>
          <ClockStartPicker
            options={actions.options}
            customerId={actions.customerId}
            onCustomerChange={actions.setCustomerId}
            serviceId={actions.serviceId}
            onServiceChange={actions.setServiceId}
            busy={actions.busy}
            onStart={() =>
              void actions.start(Number(actions.customerId), Number(actions.serviceId))
            }
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => actions.setPickerOpen(false)}>
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Dashboard({
  mine,
  calendar,
  pending,
  onNavigate,
}: {
  mine: MyAbsence[] | undefined;
  calendar: CalendarAbsence[] | undefined;
  pending: number | undefined;
  onNavigate: (section: ClockodoSection) => void;
}) {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const refreshed = useDesignPreview() === "refreshed";
  const [now, setNow] = useState(() => Date.now());
  const weekStart = mondayOfWeek(isoToday());
  const { entries: weekEntries } = useClockEntries(weekStart, isoToday(), !!user.clockodoUserId);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const hours = useMemo(() => {
    const entryMs = (entry: ClockEntry) => {
      const start = Date.parse(entry.startTime);
      const end = entry.endTime ? Date.parse(entry.endTime) : now;
      return Math.max(0, end - start);
    };
    const today = (weekEntries ?? []).filter(
      (entry) => entry.startTime.slice(0, 10) === isoToday(),
    );
    const todayMs = today.reduce((sum, entry) => sum + entryMs(entry), 0);
    const weekMs = (weekEntries ?? []).reduce((sum, entry) => sum + entryMs(entry), 0);
    const format = (ms: number) => {
      const totalMinutes = Math.round(ms / 60_000);
      return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")} h`;
    };
    return { today: format(todayMs), week: format(weekMs) };
  }, [weekEntries, now]);

  const upcoming = (mine ?? [])
    .filter(
      (absence) =>
        typeof absence.endDate === "string" &&
        absence.endDate >= isoToday() &&
        absence.status !== "cancelled",
    )
    .sort((a, b) => {
      const aDate = typeof a.startDate === "string" ? a.startDate : "";
      const bDate = typeof b.startDate === "string" ? b.startDate : "";
      return aDate.localeCompare(bDate);
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <SectionBoundary title={t("clockUnavailable")}>
        <ClockControl />
      </SectionBoundary>
      {refreshed ? (
        <KpiStrip>
          <Kpi
            featured
            label={t("statsHoursToday")}
            value={user.clockodoUserId ? hours.today : "-"}
          />
          <Kpi label={t("statsHoursWeek")} value={user.clockodoUserId ? hours.week : "-"} />
          <Kpi
            label={t("statsPending")}
            value={pending ?? "-"}
            tone={pending ? "warn" : "neutral"}
          />
          <Kpi
            label={t("teamOutToday")}
            value={
              calendar?.filter((a) => a.startDate <= isoToday() && a.endDate >= isoToday())
                .length ?? "-"
            }
          />
        </KpiStrip>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Stat
            label={t("statsHoursToday")}
            value={user.clockodoUserId ? hours.today : "-"}
            icon={Clock3}
            accent="bg-gradient-to-br from-emerald-400/30 to-emerald-500/10 text-emerald-700"
          />
          <Stat
            label={t("statsHoursWeek")}
            value={user.clockodoUserId ? hours.week : "-"}
            icon={CalendarDays}
            accent="bg-gradient-to-br from-sky-400/30 to-sky-500/10 text-sky-700"
          />
          <Stat
            label={t("statsPending")}
            value={pending ?? "-"}
            icon={Plane}
            accent="bg-gradient-to-br from-amber-400/30 to-amber-500/10 text-amber-700"
          />
          <Stat
            label={t("teamOutToday")}
            value={
              calendar?.filter((a) => a.startDate <= isoToday() && a.endDate >= isoToday())
                .length ?? "-"
            }
            icon={Users}
            accent="bg-gradient-to-br from-indigo-400/30 to-indigo-500/10 text-indigo-700"
          />
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">{t("presenceToday")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("presenceTodayHint")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate("planner")}>
              {t("openPlanner")}
            </Button>
          </CardHeader>
          <CardContent>
            <SectionBoundary title={t("presenceUnavailable")}>
              <div className="divide-y divide-border/70">
                {calendar === undefined && (
                  <p className="py-6 text-sm text-muted-foreground">{t("loading")}</p>
                )}
                {calendar?.filter((a) => a.startDate <= isoToday() && a.endDate >= isoToday())
                  .length === 0 && (
                  <p className="py-6 text-sm text-muted-foreground">{t("nobodyOutToday")}</p>
                )}
                {calendar
                  ?.filter((a) => a.startDate <= isoToday() && a.endDate >= isoToday())
                  .map((absence) => (
                    <div key={absence.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                            TYPE_STYLE[absence.type].className,
                          )}
                        >
                          {absence.userName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          {refreshed ? (
                            <PersonLink
                              userId={absence.userId as Id<"users">}
                              className="block max-w-full text-sm font-medium"
                            >
                              {absence.userName}
                            </PersonLink>
                          ) : (
                            <p className="truncate text-sm font-medium">{absence.userName}</p>
                          )}
                          <p className="truncate text-xs text-muted-foreground">
                            {absence.userDepartment ?? t("noDepartment")}
                          </p>
                        </div>
                      </div>
                      {refreshed ? (
                        <span className="shrink-0 text-xs font-medium">
                          <AbsenceTypeLabel type={absence.type} />
                        </span>
                      ) : (
                        <Badge variant="outline" className={TYPE_STYLE[absence.type].className}>
                          {t(absence.type)}
                        </Badge>
                      )}
                    </div>
                  ))}
              </div>
            </SectionBoundary>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("upcomingAbsences")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("requests")}>
              {t("viewAll")}
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <SectionBoundary title={t("upcomingUnavailable")}>
              {upcoming.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">{t("noAbsences")}</p>
              ) : (
                upcoming.map((absence) => <AbsencePill key={absence.id} absence={absence} />)
              )}
            </SectionBoundary>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Real clocked time entries for one calendar week — start/end times,
 * break gaps, and a daily total, matching what Clockodo itself calls
 * "Timetable". Distinct from the absence-type week grid this replaced,
 * which showed vacation/sick days, not actual worked hours. */
function Timetable() {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const locale = useLocale();
  const eden = useEdenApi();
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const weekStart = addDaysIso(mondayOfWeek(isoToday()), offset * 7);
  const dates = Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index));
  const [selected, setSelected] = useState(() =>
    dates.includes(isoToday()) ? isoToday() : dates[0],
  );
  const inThisWeek = dates.includes(selected) ? selected : dates[0];

  const { entries, refresh } = useClockEntries(dates[0], dates.at(-1)!, !!user.clockodoUserId);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const byDay = useMemo(() => {
    const grouped = new Map<string, ClockEntry[]>();
    for (const entry of entries ?? []) {
      const day = entry.startTime.slice(0, 10);
      const list = grouped.get(day) ?? [];
      list.push(entry);
      grouped.set(day, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return grouped;
  }, [entries]);

  function totalMsFor(day: string): number {
    return (byDay.get(day) ?? []).reduce((sum, entry) => {
      const start = Date.parse(entry.startTime);
      const end = entry.endTime ? Date.parse(entry.endTime) : now;
      return sum + Math.max(0, end - start);
    }, 0);
  }

  function formatHours(ms: number): string {
    const totalMinutes = Math.round(ms / 60_000);
    return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")} h`;
  }

  if (!user.clockodoUserId) {
    return <NoPersonalClockodoAccount hint={t("noPersonalAccountTimetableHint")} />;
  }

  const dayEntries = byDay.get(inThisWeek) ?? [];

  async function remove(entry: ClockEntry) {
    try {
      await deleteClockEntry(eden, entry.id, inThisWeek);
      refresh();
    } catch {
      toast.error(t("entryDeleteFailed"));
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border/70 bg-gradient-to-r from-muted/60 to-muted/10 refreshed:bg-none">
        <div>
          <CardTitle className="text-base">{t("yourTimetable")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatIsoDate(dates[0], locale)} - {formatIsoDate(dates.at(-1)!, locale)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previousWeek")}
            onClick={() => setOffset((value) => value - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("nextWeek")}
            onClick={() => setOffset((value) => value + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {/* No min-width here (unlike the multi-week Planner grid below, which
            genuinely needs it): 7 columns already fit a phone screen if left
            to shrink naturally, so forcing one made a simple day picker
            scroll for no reason. `overflow-x-auto` above still catches the
            rare viewport too narrow for even that. */}
        <div className="grid grid-cols-7 border-b border-border/70">
          {dates.map((date) => {
            const active = date === inThisWeek;
            const isToday = date === isoToday();
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                className={cn(
                  "border-r border-border/70 px-2 py-3 text-center transition-colors last:border-r-0 hover:bg-accent",
                  active && "bg-accent",
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
                    weekday: "short",
                    timeZone: "UTC",
                  })}
                </p>
                <p className={cn("mt-1 text-sm font-semibold", isToday && "text-primary")}>
                  {new Date(`${date}T00:00:00Z`).getUTCDate()}
                </p>
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {entries === undefined ? "···" : formatHours(totalMsFor(date))}
                </p>
              </button>
            );
          })}
        </div>
        <div className="p-2">
          {entries === undefined && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">{t("loading")}</p>
          )}
          {entries !== undefined && dayEntries.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {t("noTimeEntries")}
            </p>
          )}
          {dayEntries.map((entry, index) => {
            const previous = dayEntries[index - 1];
            const breakLabel =
              previous?.endTime && entry.startTime
                ? elapsedSince(previous.endTime, Date.parse(entry.startTime))
                : null;
            const duration = elapsedSince(
              entry.startTime,
              entry.endTime ? Date.parse(entry.endTime) : now,
            );
            return (
              <div key={entry.id}>
                {breakLabel && (
                  <div className="my-1.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,hsl(var(--muted))_6px,hsl(var(--muted))_12px)] px-3 py-2 text-xs text-muted-foreground">
                    <Coffee className="size-3.5" />
                    {t("breakDuration", { duration: breakLabel })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 border-l-2 border-l-primary/60 bg-card px-3 py-2.5 shadow-sm refreshed:shadow-none">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatClockTime(entry.startTime, locale)} –{" "}
                      {entry.endTime
                        ? formatClockTime(entry.endTime, locale)
                        : t("entryInProgress")}
                    </p>
                    {(entry.customerName || entry.serviceName) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[entry.customerName, entry.serviceName].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">{duration}</span>
                    {entry.endTime && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("deleteEntry")}
                        onClick={() => void remove(entry)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {dayEntries.length > 0 && (
            <div className="flex items-center justify-between px-3 pt-3 text-sm font-semibold">
              <span>{t("dailyTotal")}</span>
              <span className="tabular-nums">{formatHours(totalMsFor(inThisWeek))}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ClockodoAbsenceDialog({
  absence,
  open,
  onOpenChange,
  onSaved,
}: {
  absence: MyAbsence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Absences");
  const eden = useEdenApi();
  const [clockodoType, setClockodoType] = useState("1");
  const [dateSince, setDateSince] = useState(isoToday());
  const [dateUntil, setDateUntil] = useState(isoToday());
  const [halfDay, setHalfDay] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClockodoType(String(absence?.clockodoType ?? 1));
    setDateSince(absence?.startDate ?? isoToday());
    setDateUntil(absence?.endDate ?? isoToday());
    setHalfDay(absence?.halfDay ?? false);
    setNote(absence?.reason ?? "");
  }, [absence, open]);

  async function submit() {
    if (!dateSince || !dateUntil || dateUntil < dateSince) return;
    setSaving(true);
    const body = {
      clockodoType: Number(clockodoType),
      dateSince,
      dateUntil,
      halfDay,
      note: note.trim() || undefined,
    };
    const response = absence
      ? await eden.clockodo.absences.me({ id: absence.id }).put(body)
      : await eden.clockodo.absences.me.post(body);
    setSaving(false);
    if (response.error) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{absence ? t("editAbsence") : t("newAbsence")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {t("absenceType")}
            </label>
            <Select value={clockodoType} onValueChange={setClockodoType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLOCKODO_ABSENCE_GROUPS.map((group) => (
                  <SelectGroup key={group.key}>
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`absenceTypeGroups.${group.key}`)}
                    </p>
                    {group.types.map((type) => (
                      <SelectItem key={type} value={String(type)}>
                        {t(`clockodoTypes.${CLOCKODO_TYPE_KEYS[type]}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {t("startDate")}
              </label>
              <Input
                type="date"
                value={dateSince}
                onChange={(event) => setDateSince(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {t("endDate")}
              </label>
              <Input
                type="date"
                value={dateUntil}
                onChange={(event) => setDateUntil(event.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            <Checkbox checked={halfDay} onCheckedChange={(value) => setHalfDay(value === true)} />
            {t("halfDay")}
          </label>
          <div>
            <label className="mb-1 block text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {t("note")}
            </label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving || !dateSince || !dateUntil || dateUntil < dateSince}
          >
            {t("saveAbsence")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Requests({
  mine,
  onExport,
  onSaved,
}: {
  mine: MyAbsence[] | undefined;
  onExport: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MyAbsence | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const refreshed = useDesignPreview() === "refreshed";
  const [statuses, setStatuses] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const visible = (mine ?? []).filter((absence) =>
    `${absence.type} ${absence.reason ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  const dialogs = (
    <>
      <ClockodoAbsenceDialog
        absence={null}
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={onSaved}
      />
      <ClockodoAbsenceDialog
        absence={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={onSaved}
      />
    </>
  );

  if (refreshed) {
    const search = query.trim().toLowerCase();
    const rows = (mine ?? [])
      .filter(
        (absence) =>
          (!search ||
            `${t(absence.type)} ${absence.reason ?? ""}`.toLowerCase().includes(search)) &&
          (statuses.length === 0 || statuses.includes(absence.status)) &&
          (types.length === 0 || types.includes(absence.type)),
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    const range = (absence: MyAbsence) =>
      `${formatIsoDate(absence.startDate, locale)} – ${formatIsoDate(absence.endDate, locale)}`;

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-64" data-tour="tour-absences-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchRequests")}
              aria-label={t("searchRequests")}
              className="h-9 rounded-full pl-8 text-sm md:h-7 md:text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-1">
            <FilterPill
              label={t("status")}
              options={ABSENCE_STATUSES.map((status) => ({
                value: status,
                label: t(status),
                count: (mine ?? []).filter((absence) => absence.status === status).length,
                leading: (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: STATUS_ACCENT[status] }}
                  />
                ),
              }))}
              selected={statuses}
              onChange={setStatuses}
              clearLabel={t("clearFilter", { label: t("status") })}
            />
            <FilterPill
              label={t("type")}
              options={ABSENCE_TYPES.map((type) => ({
                value: type,
                label: t(type),
                leading: (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: TYPE_STYLE[type].accent }}
                  />
                ),
              }))}
              selected={types}
              onChange={setTypes}
              clearLabel={t("clearFilter", { label: t("type") })}
            />
            <div className="ml-auto flex items-center gap-2" data-tour="tour-absences-new">
              <Button variant="ghost" size="sm" onClick={onExport}>
                <CalendarArrowDown />
                {t("exportIcs")}
              </Button>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus />
                {t("newAbsence")}
              </Button>
            </div>
          </div>
        </div>

        <div data-tour="tour-absences-list">
          {mine === undefined ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Plane />}
              title={mine.length === 0 ? t("noAbsences") : t("noRequestsFiltered")}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("type")}</TableHead>
                    <TableHead className="w-60">{t("period")}</TableHead>
                    <TableHead className="w-20 text-right">{t("absenceDays")}</TableHead>
                    <TableHead className="w-32">{t("status")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((absence) => {
                    const editable = absence.status === "pending";
                    return (
                      <TableRow
                        key={absence.id}
                        tabIndex={editable ? 0 : undefined}
                        title={editable ? t("editAbsence") : undefined}
                        onClick={editable ? () => setEditing(absence) : undefined}
                        onKeyDown={(event) => {
                          if (editable && event.key === "Enter") setEditing(absence);
                        }}
                        className={
                          editable
                            ? "cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                            : "hover:bg-transparent"
                        }
                      >
                        <TableCell className="w-full max-w-0">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="shrink-0 font-medium">
                              <AbsenceTypeLabel type={absence.type} />
                            </span>
                            {absence.reason && (
                              <span className="truncate text-muted-foreground">
                                {absence.reason}
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{range(absence)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {workingDays(absence.startDate, absence.endDate, absence.halfDay)}
                        </TableCell>
                        <TableCell>
                          <AbsenceStatusBadge status={absence.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {editable && (
                            <Pencil
                              aria-hidden
                              className="ml-auto size-3.5 text-muted-foreground"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <ul className="divide-y divide-border/60 md:hidden">
                {rows.map((absence) => (
                  <li key={absence.id}>
                    <button
                      type="button"
                      disabled={absence.status !== "pending"}
                      onClick={() => setEditing(absence)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block text-sm font-medium">
                          <AbsenceTypeLabel type={absence.type} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {range(absence)} ·{" "}
                          {t("workingDaysLabel", {
                            count: workingDays(absence.startDate, absence.endDate, absence.halfDay),
                          })}
                        </span>
                      </span>
                      <AbsenceStatusBadge status={absence.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border/70 bg-gradient-to-r from-muted/60 to-muted/10 refreshed:bg-none">
        <div>
          <CardTitle className="text-base">{t("yourRequests")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("yourRequestsHint")}</p>
        </div>
        <div className="flex items-center gap-2" data-tour="tour-absences-new">
          <Button variant="outline" size="sm" onClick={onExport}>
            <CalendarArrowDown />
            {t("exportIcs")}
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus />
            {t("newAbsence")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-b border-border/70 p-4">
          <div className="relative max-w-sm" data-tour="tour-absences-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchRequests")}
              className="pl-9"
            />
          </div>
          <AbsenceTypeLegend className="mt-3" />
        </div>
        <div className="divide-y divide-border/70" data-tour="tour-absences-list">
          {visible.map((absence) => {
            const style = TYPE_STYLE[absence.type];
            return (
              <div
                key={absence.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DateBadge date={absence.startDate} className={style.className} />
                  <div className="min-w-0">
                    <p className="font-medium">{t(absence.type)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatIsoDate(absence.startDate, locale)} -{" "}
                      {formatIsoDate(absence.endDate, locale)} ·{" "}
                      {t("workingDaysLabel", {
                        count: workingDays(absence.startDate, absence.endDate, absence.halfDay),
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AbsenceStatusBadge status={absence.status} />
                  {absence.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(absence)}>
                      {t("editAbsence")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {mine !== undefined && visible.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              {t("noAbsences")}
            </p>
          )}
        </div>
      </CardContent>
      {dialogs}
    </Card>
  );
}

function Approvals({
  approvals,
  onDecided,
}: {
  approvals: PendingApproval[] | undefined;
  onDecided: () => void;
}) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const eden = useEdenApi();
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function decide(approval: PendingApproval, status: "approved" | "denied") {
    setActingOn(approval.id);
    try {
      await setAbsenceApprovalStatus(eden, approval.id, status);
      toast.success(status === "approved" ? t("approved") : t("denied"));
      onDecided();
    } catch {
      toast.error(t("approvalActionFailed"));
    } finally {
      setActingOn(null);
    }
  }

  const refreshed = useDesignPreview() === "refreshed";

  if (refreshed) {
    if (approvals === undefined) {
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      );
    }
    if (approvals.length === 0) return <EmptyState icon={<Check />} title={t("noApprovals")} />;

    const range = (approval: PendingApproval) =>
      `${formatIsoDate(approval.startDate, locale)} – ${formatIsoDate(approval.endDate, locale)}`;
    const days = (approval: PendingApproval) =>
      workingDays(approval.startDate, approval.endDate, approval.halfDay);
    const actions = (approval: PendingApproval) => (
      <>
        <Button
          size="sm"
          variant="ghost"
          disabled={actingOn === approval.id}
          onClick={() => void decide(approval, "denied")}
        >
          <X />
          {t("deny")}
        </Button>
        <Button
          size="sm"
          disabled={actingOn === approval.id}
          onClick={() => void decide(approval, "approved")}
        >
          <Check />
          {t("approve")}
        </Button>
      </>
    );

    return (
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("employee")}</TableHead>
              <TableHead className="w-36">{t("type")}</TableHead>
              <TableHead className="w-56">{t("period")}</TableHead>
              <TableHead className="w-20 text-right">{t("absenceDays")}</TableHead>
              <TableHead className="w-52" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {approvals.map((approval) => {
              const detail = [approval.userDepartment, approval.reason].filter(Boolean).join(" · ");
              return (
                <TableRow key={approval.id} className="hover:bg-transparent">
                  <TableCell className="w-full max-w-0">
                    <PersonLink
                      userId={approval.userId as Id<"users">}
                      className="block max-w-full font-medium"
                    >
                      {approval.userName}
                    </PersonLink>
                    {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
                  </TableCell>
                  <TableCell>
                    <AbsenceTypeLabel type={approval.type} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{range(approval)}</TableCell>
                  <TableCell className="text-right tabular-nums">{days(approval)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">{actions(approval)}</div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <ul className="divide-y divide-border/60 md:hidden">
          {approvals.map((approval) => (
            <li key={approval.id} className="space-y-2.5 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <PersonLink
                  userId={approval.userId as Id<"users">}
                  className="block max-w-full text-sm font-medium"
                >
                  {approval.userName}
                </PersonLink>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <AbsenceTypeLabel type={approval.type} />
                  <span>
                    {range(approval)} · {t("workingDaysLabel", { count: days(approval) })}
                  </span>
                </p>
                {approval.reason && (
                  <p className="text-xs text-muted-foreground">{approval.reason}</p>
                )}
              </div>
              <div className="flex justify-end gap-1.5">{actions(approval)}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-gradient-to-r from-muted/60 to-muted/10 refreshed:bg-none">
        <CardTitle className="text-base">{t("pendingApprovals")}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{t("pendingApprovalsHint")}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/70">
          {approvals?.map((approval) => {
            const style = TYPE_STYLE[approval.type];
            return (
              <div
                key={approval.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DateBadge date={approval.startDate} className={style.className} />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {approval.userName} · {t(approval.type)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatIsoDate(approval.startDate, locale)} -{" "}
                      {formatIsoDate(approval.endDate, locale)} ·{" "}
                      {t("workingDaysLabel", {
                        count: workingDays(approval.startDate, approval.endDate, approval.halfDay),
                      })}
                    </p>
                    {approval.reason && (
                      <p className="mt-1 text-sm text-muted-foreground">{approval.reason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actingOn === approval.id}
                    onClick={() => void decide(approval, "denied")}
                  >
                    <X />
                    {t("deny")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={actingOn === approval.id}
                    onClick={() => void decide(approval, "approved")}
                  >
                    <Check />
                    {t("approve")}
                  </Button>
                </div>
              </div>
            );
          })}
          {approvals !== undefined && approvals.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              {t("noApprovals")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Team calendar (Calendar view) plus a per-employee days/periods rollup
 * (Summary view, folded in from the former standalone "Reports" tab — it
 * added little as its own nav item, being just this same data as a bare
 * two-column table) behind one segmented toggle instead of two tabs. */
function Planner({ calendar }: { calendar: CalendarAbsence[] | undefined }) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const hasTeamAccess = useHasCapability("view_clockodo_team");
  const refreshed = useDesignPreview() === "refreshed";
  const [view, setView] = useState<"calendar" | "summary">("calendar");
  const [start, setStart] = useState(isoToday());
  const end = addDaysIso(start, 27);
  const people = useMemo(() => {
    const grouped = new Map<string, CalendarAbsence[]>();
    for (const absence of calendar ?? []) {
      if (!rangesOverlap(absence.startDate, absence.endDate, start, end)) continue;
      const list = grouped.get(absence.userName) ?? [];
      list.push(absence);
      grouped.set(absence.userName, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [calendar, start, end]);
  const days = Array.from({ length: 28 }, (_, index) => addDaysIso(start, index));

  const year = String(new Date().getFullYear());
  const summaryRows = useMemo(() => {
    const summary = new Map<string, { department: string | null; days: number; periods: number }>();
    for (const absence of calendar ?? []) {
      if (typeof absence.startDate !== "string" || !absence.startDate.startsWith(year)) continue;
      const existing = summary.get(absence.userName) ?? {
        department: absence.userDepartment,
        days: 0,
        periods: 0,
      };
      existing.days += workingDays(absence.startDate, absence.endDate, absence.halfDay);
      existing.periods += 1;
      summary.set(absence.userName, existing);
    }
    return [...summary.entries()].sort(([, a], [, b]) => b.days - a.days);
  }, [calendar, year]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border/70 bg-gradient-to-r from-muted/60 to-muted/10 refreshed:bg-none">
        <div>
          <CardTitle className="text-base">
            {view === "calendar" ? t("absencePlanner") : t("teamReport", { year })}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "calendar"
              ? `${formatIsoDate(start, locale)} - ${formatIsoDate(end, locale)}`
              : t("teamReportHint")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasTeamAccess && refreshed && (
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "calendar", label: t("viewCalendar") },
                { value: "summary", label: t("viewSummary") },
              ]}
            />
          )}
          {hasTeamAccess && !refreshed && (
            <div className="flex items-center gap-0.5 rounded-md border border-border/70 p-0.5">
              <Button
                variant={view === "calendar" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("calendar")}
              >
                {t("viewCalendar")}
              </Button>
              <Button
                variant={view === "summary" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("summary")}
              >
                {t("viewSummary")}
              </Button>
            </div>
          )}
          {view === "calendar" && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("previousPeriod")}
                onClick={() => setStart(addDaysIso(start, -28))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("nextPeriod")}
                onClick={() => setStart(addDaysIso(start, 28))}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {view === "calendar" ? (
        <CardContent className="overflow-x-auto p-0">
          <AbsenceTypeLegend className="border-b border-border/70 px-4 py-2.5" />
          <div className="min-w-[58rem]">
            <div className="grid grid-cols-[13rem_repeat(28,minmax(0,1fr))] border-b border-border/70">
              <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
                {t("employee")}
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="border-l border-border/70 py-3 text-center text-[11px] text-muted-foreground"
                >
                  {new Date(`${day}T00:00:00`).getDate()}
                </div>
              ))}
            </div>
            {people.map(([name, absences]) => (
              <div
                key={name}
                className="grid grid-cols-[13rem_repeat(28,minmax(0,1fr))] border-b border-border/70 last:border-0"
              >
                <div className="px-4 py-3 text-sm font-medium">{name}</div>
                <div className="relative col-span-28 min-h-11 border-l border-border/70 bg-[linear-gradient(to_right,transparent_calc(100%-1px),hsl(var(--border)/.7)_calc(100%-1px))] bg-[size:3.571428%_100%]">
                  {absences.map((absence) => (
                    <CalendarBar key={absence.id} absence={absence} start={start} end={end} />
                  ))}
                </div>
              </div>
            ))}
            {calendar !== undefined && people.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("nobodyOut")}</p>
            )}
          </div>
        </CardContent>
      ) : (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="border-b border-border/70 bg-muted/35 text-left text-xs uppercase tracking-wider text-muted-foreground refreshed:bg-muted/40 refreshed:normal-case refreshed:tracking-normal [&_th]:refreshed:font-medium">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t("employee")}</th>
                  <th className="px-5 py-3 font-semibold">{t("department")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t("absencePeriods")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t("absenceDays")}</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(([name, row]) => (
                  <tr key={name} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-3 font-medium">{name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.department ?? "-"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.periods}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function ClockodoWorkspace({ section }: { section: ClockodoSection }) {
  const t = useTranslations("Absences");
  const router = useRouter();
  const hasTeamAccess = useHasCapability("view_clockodo_team");
  const canManageClockodo = useHasCapability("manage_clockodo_team");
  const approvalCover = useQuery(api.approvalDelegations.mine);
  const hasApprovalCover = (approvalCover?.length ?? 0) > 0;
  const canReviewAbsences = canManageClockodo || hasApprovalCover;
  const { absences: mine, refresh } = useMyAbsences();
  const calendarStart = addDaysIso(isoToday(), -31);
  const calendarEnd = addDaysIso(isoToday(), 90);
  const calendar = useAbsencesCalendar(calendarStart, calendarEnd);
  const pending = usePendingAbsenceCount(hasTeamAccess);
  const { approvals, refresh: refreshApprovals } = usePendingApprovals(canReviewAbsences);

  function exportIcs() {
    const approved = (mine ?? []).filter((absence) => absence.status === "approved");
    const ics = buildIcs(
      t("title"),
      approved.map((absence) => ({
        uid: absence.id,
        title: t(absence.type),
        startDate: absence.startDate,
        endDate: absence.endDate,
        description: absence.reason ?? undefined,
      })),
    );
    downloadIcs("clockodo-absences.ics", ics);
    toast.success(t("exported"));
  }

  const navigate = (next: ClockodoSection) => {
    const href: Record<ClockodoSection, string> = {
      dashboard: "/clockodo",
      timetable: "/clockodo/timetable",
      requests: "/clockodo/requests",
      planner: "/clockodo/planner",
      approvals: "/clockodo/approvals",
      admin: "/clockodo/admin",
    };
    router.push(href[next]);
  };

  const isAbsencesSubSection =
    section === "requests" || section === "approvals" || section === "planner";

  return (
    <ErrorBoundary
      key={section}
      fallback={({ error, reset }) => (
        <ErrorFallback
          title={t("sectionUnavailable")}
          description={error.message}
          onRetry={reset}
        />
      )}
    >
      {section === "dashboard" && (
        <Dashboard mine={mine} calendar={calendar} pending={pending} onNavigate={navigate} />
      )}
      {section === "timetable" && <Timetable />}
      <div className={cn(isAbsencesSubSection && "space-y-4")}>
        {isAbsencesSubSection && (
          <AbsencesSubNav
            active={section}
            canManageClockodo={canReviewAbsences}
            onNavigate={navigate}
          />
        )}
        {section === "requests" && <Requests mine={mine} onExport={exportIcs} onSaved={refresh} />}
        {section === "planner" && <Planner calendar={calendar} />}
        {section === "approvals" &&
          (canReviewAbsences ? (
            <Approvals approvals={approvals} onDecided={refreshApprovals} />
          ) : (
            <ForbiddenScreen />
          ))}
      </div>
      {section === "admin" && (canManageClockodo ? <ClockodoAdminPanel /> : <ForbiddenScreen />)}
    </ErrorBoundary>
  );
}

export default function ClockodoPage() {
  return <ClockodoWorkspace section="dashboard" />;
}
