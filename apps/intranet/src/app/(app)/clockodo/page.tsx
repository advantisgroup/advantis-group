"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarArrowDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Plane,
  Plus,
  Play,
  Search,
  Square,
  Thermometer,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import ClockodoIntegrationPage from "../admin/integrations/clockodo/page";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import {
  useHasCapability,
  useIsManager,
} from "@/components/providers/current-user";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addDaysIso,
  isoToday,
  rangesOverlap,
  workingDays,
} from "@/lib/absences";
import {
  type AbsenceStatus,
  type AbsenceType,
  type CalendarAbsence,
  type MyAbsence,
  useAbsencesCalendar,
  useMyAbsences,
  usePendingAbsenceCount,
} from "@/lib/absences-api";
import { formatIsoDate } from "@/lib/format";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { useEdenApi } from "@/lib/eden";
import { cn } from "@/lib/utils";

type ClockodoSection =
  "dashboard" | "timetable" | "reports" | "planner" | "requests" | "admin";

/**
 * Isolates one independently-fetched widget so its own crash shows a small
 * inline "this part failed" card instead of taking the rest of the page
 * (other widgets, the tab bar) down with it.
 */
function SectionBoundary({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
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

interface ClockControlState {
  accountName: string;
  status: "working" | "break" | "clockedOut";
  since: string | null;
  entryId: number | null;
}

interface ClockOption {
  id: number;
  name: string;
}

const TYPE_STYLE: Record<
  AbsenceType,
  { icon: typeof Plane; className: string }
> = {
  vacation: {
    icon: Plane,
    className: "bg-emerald-400/15 text-emerald-700 dark:text-emerald-300",
  },
  sick: {
    icon: Thermometer,
    className: "bg-rose-400/15 text-rose-700 dark:text-rose-300",
  },
  personal: {
    icon: CircleDashed,
    className: "bg-sky-400/15 text-sky-700 dark:text-sky-300",
  },
  other: {
    icon: CircleDashed,
    className: "bg-amber-400/15 text-amber-700 dark:text-amber-300",
  },
};

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

function statusVariant(
  status: AbsenceStatus
): "warning" | "success" | "destructive" | "muted" {
  const variants: Record<
    AbsenceStatus,
    "warning" | "success" | "destructive" | "muted"
  > = {
    pending: "warning",
    approved: "success",
    denied: "destructive",
    cancelled: "muted",
  };
  return variants[status];
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
      (new Date(`${end}T00:00:00Z`).getTime() -
        new Date(`${start}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1
  );
  const first = absence.startDate < start ? start : absence.startDate;
  const last = absence.endDate > end ? end : absence.endDate;
  const offset = Math.round(
    (new Date(`${first}T00:00:00Z`).getTime() -
      new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000
  );
  const length =
    Math.round(
      (new Date(`${last}T00:00:00Z`).getTime() -
        new Date(`${first}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1;
  return (
    <span
      className="absolute top-1/2 h-5 -translate-y-1/2 rounded-sm bg-emerald-500/80"
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
        <span
          className={cn("grid size-9 place-items-center rounded-md", accent)}
        >
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function AbsencePill({ absence }: { absence: MyAbsence }) {
  const t = useTranslations("Absences");
  const style = TYPE_STYLE[absence.type];
  const Icon = style.icon;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md",
            style.className
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{t(absence.type)}</p>
          <p className="text-xs text-muted-foreground">
            {absence.startDate} - {absence.endDate}
          </p>
        </div>
      </div>
      <Badge variant={statusVariant(absence.status)}>{t(absence.status)}</Badge>
    </div>
  );
}

function ClockControl() {
  const t = useTranslations("Absences");
  const eden = useEdenApi();
  const [clock, setClock] = useState<ClockControlState | null>(null);
  const [options, setOptions] = useState<{
    customers: ClockOption[];
    services: ClockOption[];
  } | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await eden.clockodo.clock.me.get();
    if (data) setClock(data);
  }, [eden]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function start(customer: number, service: number) {
    setBusy(true);
    try {
      const { error } = await eden.clockodo.clock.me.post({
        customerId: customer,
        serviceId: service,
      });
      if (error) throw error;
      setStartOpen(false);
      await refresh();
      toast.success(t("clockStarted"));
    } catch {
      toast.error(t("clockActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function openStart() {
    setBusy(true);
    let opts = options;
    if (!opts) {
      const { data } = await eden.clockodo.clock.options.get();
      if (!data) {
        setBusy(false);
        return;
      }
      opts = data;
      setOptions(data);
    }
    setBusy(false);
    // Nothing to choose between — just start the clock instead of making
    // the person pick from single-item dropdowns.
    if (opts.customers.length === 1 && opts.services.length === 1) {
      await start(opts.customers[0].id, opts.services[0].id);
      return;
    }
    setCustomerId(
      opts.customers.length === 1 ? String(opts.customers[0].id) : ""
    );
    setServiceId(opts.services.length === 1 ? String(opts.services[0].id) : "");
    setStartOpen(true);
  }

  async function stop() {
    if (!clock?.entryId) return;
    setBusy(true);
    try {
      const { error } = await eden.clockodo.clock
        .me({ entryId: String(clock.entryId) })
        .delete();
      if (error) throw error;
      await refresh();
      toast.success(t("clockStopped"));
    } catch {
      toast.error(t("clockActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const working = clock?.status === "working";
  return (
    <>
      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-md",
                working
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Clock3 className="size-5" />
            </span>
            <div>
              <p className="font-medium">
                {clock?.accountName ?? t("clockLoading")}
              </p>
              <p className="text-sm text-muted-foreground">
                {working && clock?.since
                  ? t("clockRunningSince", {
                      time: new Date(clock.since).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })
                  : t("clockReady")}
              </p>
            </div>
          </div>
          {working ? (
            <Button
              variant="outline"
              onClick={() => void stop()}
              disabled={busy}
            >
              <Square className="size-4" />
              {t("stopClock")}
            </Button>
          ) : (
            <Button onClick={() => void openStart()} disabled={!clock || busy}>
              <Play className="size-4" />
              {t("startClock")}
            </Button>
          )}
        </CardContent>
      </Card>
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("startClock")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder={t("clockCustomer")} />
              </SelectTrigger>
              <SelectContent>
                {options?.customers.map(customer => (
                  <SelectItem key={customer.id} value={String(customer.id)}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder={t("clockService")} />
              </SelectTrigger>
              <SelectContent>
                {options?.services.map(service => (
                  <SelectItem key={service.id} value={String(service.id)}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => void start(Number(customerId), Number(serviceId))}
              disabled={!customerId || !serviceId || busy}
            >
              {t("startClock")}
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
  const year = new Date().getFullYear();
  const totals = useMemo(() => {
    const rows = mine ?? [];
    const sum = (type: AbsenceType) =>
      rows
        .filter(
          absence =>
            absence.status === "approved" &&
            absence.type === type &&
            typeof absence.startDate === "string" &&
            absence.startDate.startsWith(String(year))
        )
        .reduce(
          (total, absence) =>
            total +
            workingDays(absence.startDate, absence.endDate, absence.halfDay),
          0
        );
    return { vacation: sum("vacation"), sick: sum("sick") };
  }, [mine, year]);
  const upcoming = (mine ?? [])
    .filter(
      absence =>
        typeof absence.endDate === "string" &&
        absence.endDate >= isoToday() &&
        absence.status !== "cancelled"
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("statsVacation", { year })}
          value={totals.vacation}
          icon={Plane}
          accent="bg-emerald-400/15 text-emerald-700"
        />
        <Stat
          label={t("statsSick", { year })}
          value={totals.sick}
          icon={Thermometer}
          accent="bg-rose-400/15 text-rose-700"
        />
        <Stat
          label={t("statsPending")}
          value={pending ?? "-"}
          icon={Clock3}
          accent="bg-amber-400/15 text-amber-700"
        />
        <Stat
          label={t("teamOutToday")}
          value={
            calendar?.filter(
              a => a.startDate <= isoToday() && a.endDate >= isoToday()
            ).length ?? "-"
          }
          icon={Users}
          accent="bg-sky-400/15 text-sky-700"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">{t("presenceToday")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("presenceTodayHint")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("planner")}
            >
              {t("openPlanner")}
            </Button>
          </CardHeader>
          <CardContent>
            <SectionBoundary title={t("presenceUnavailable")}>
              <div className="divide-y divide-border/70">
                {calendar === undefined && (
                  <p className="py-6 text-sm text-muted-foreground">
                    {t("loading")}
                  </p>
                )}
                {calendar?.filter(
                  a => a.startDate <= isoToday() && a.endDate >= isoToday()
                ).length === 0 && (
                  <p className="py-6 text-sm text-muted-foreground">
                    {t("nobodyOutToday")}
                  </p>
                )}
                {calendar
                  ?.filter(
                    a => a.startDate <= isoToday() && a.endDate >= isoToday()
                  )
                  .map(absence => (
                    <div
                      key={absence.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-xs font-semibold text-emerald-700">
                          {absence.userName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {absence.userName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {absence.userDepartment ?? t("noDepartment")}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success">{t("vacation")}</Badge>
                    </div>
                  ))}
              </div>
            </SectionBoundary>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("upcomingAbsences")}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("requests")}
            >
              {t("viewAll")}
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <SectionBoundary title={t("upcomingUnavailable")}>
              {upcoming.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  {t("noAbsences")}
                </p>
              ) : (
                upcoming.map(absence => (
                  <AbsencePill key={absence.id} absence={absence} />
                ))
              )}
            </SectionBoundary>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Timetable({ mine }: { mine: MyAbsence[] | undefined }) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const [offset, setOffset] = useState(0);
  const start = addDaysIso(isoToday(), offset * 7);
  const dates = Array.from({ length: 7 }, (_, index) =>
    addDaysIso(start, index)
  );
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border/70">
        <div>
          <CardTitle className="text-base">{t("yourTimetable")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatIsoDate(dates[0], locale)} -{" "}
            {formatIsoDate(dates.at(-1)!, locale)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previousWeek")}
            onClick={() => setOffset(value => value - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("nextWeek")}
            onClick={() => setOffset(value => value + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid min-w-[44rem] grid-cols-7 border-b border-border/70">
          {dates.map(date => (
            <div
              key={date}
              className="border-r border-border/70 px-3 py-3 text-center last:border-r-0"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
                  weekday: "short",
                })}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {new Date(`${date}T00:00:00`).getDate()}
              </p>
            </div>
          ))}
        </div>
        <div className="grid min-w-[44rem] grid-cols-7">
          {dates.map(date => {
            const absences = (mine ?? []).filter(
              absence =>
                absence.status !== "cancelled" &&
                absence.startDate <= date &&
                absence.endDate >= date
            );
            return (
              <div
                key={date}
                className="min-h-72 border-r border-border/70 p-2 last:border-r-0"
              >
                <div className="space-y-2">
                  {absences.map(absence => {
                    const style = TYPE_STYLE[absence.type];
                    return (
                      <div
                        key={absence.id}
                        className={cn(
                          "rounded-md p-2 text-xs font-medium",
                          style.className
                        )}
                      >
                        {t(absence.type)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
          <DialogTitle>
            {absence ? t("editAbsence") : t("newAbsence")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("absenceType")}
            </label>
            <Select value={clockodoType} onValueChange={setClockodoType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLOCKODO_ABSENCE_GROUPS.map(group => (
                  <SelectGroup key={group.key}>
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`absenceTypeGroups.${group.key}`)}
                    </p>
                    {group.types.map(type => (
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("startDate")}
              </label>
              <Input
                type="date"
                value={dateSince}
                onChange={event => setDateSince(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("endDate")}
              </label>
              <Input
                type="date"
                value={dateUntil}
                onChange={event => setDateUntil(event.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={halfDay}
              onCheckedChange={value => setHalfDay(value === true)}
            />
            {t("halfDay")}
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("note")}
            </label>
            <Textarea
              value={note}
              onChange={event => setNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              saving || !dateSince || !dateUntil || dateUntil < dateSince
            }
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
  const visible = (mine ?? []).filter(absence =>
    `${absence.type} ${absence.reason ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border/70">
        <div>
          <CardTitle className="text-base">{t("yourRequests")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("yourRequestsHint")}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t("searchRequests")}
              className="pl-9"
            />
          </div>
        </div>
        <div className="divide-y divide-border/70">
          {visible.map(absence => {
            const style = TYPE_STYLE[absence.type];
            const Icon = style.icon;
            return (
              <div
                key={absence.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-md",
                      style.className
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{t(absence.type)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatIsoDate(absence.startDate, locale)} -{" "}
                      {formatIsoDate(absence.endDate, locale)} ·{" "}
                      {t("workingDaysLabel", {
                        count: workingDays(
                          absence.startDate,
                          absence.endDate,
                          absence.halfDay
                        ),
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(absence.status)}>
                    {t(absence.status)}
                  </Badge>
                  {absence.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(absence)}
                    >
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
      <ClockodoAbsenceDialog
        absence={null}
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={onSaved}
      />
      <ClockodoAbsenceDialog
        absence={editing}
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
        onSaved={onSaved}
      />
    </Card>
  );
}

function Planner({ calendar }: { calendar: CalendarAbsence[] | undefined }) {
  const t = useTranslations("Absences");
  const locale = useLocale();
  const [start, setStart] = useState(isoToday());
  const end = addDaysIso(start, 27);
  const people = useMemo(() => {
    const grouped = new Map<string, CalendarAbsence[]>();
    for (const absence of calendar ?? []) {
      if (!rangesOverlap(absence.startDate, absence.endDate, start, end))
        continue;
      const list = grouped.get(absence.userName) ?? [];
      list.push(absence);
      grouped.set(absence.userName, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [calendar, start, end]);
  const days = Array.from({ length: 28 }, (_, index) =>
    addDaysIso(start, index)
  );
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border/70">
        <div>
          <CardTitle className="text-base">{t("absencePlanner")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatIsoDate(start, locale)} - {formatIsoDate(end, locale)}
          </p>
        </div>
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
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <div className="min-w-[58rem]">
          <div className="grid grid-cols-[13rem_repeat(28,minmax(0,1fr))] border-b border-border/70">
            <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("employee")}
            </div>
            {days.map(day => (
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
                {absences.map(absence => (
                  <CalendarBar
                    key={absence.id}
                    absence={absence}
                    start={start}
                    end={end}
                  />
                ))}
              </div>
            </div>
          ))}
          {calendar !== undefined && people.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("nobodyOut")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Reports({ calendar }: { calendar: CalendarAbsence[] | undefined }) {
  const t = useTranslations("Absences");
  const year = String(new Date().getFullYear());
  const rows = useMemo(() => {
    const summary = new Map<
      string,
      { department: string | null; days: number; periods: number }
    >();
    for (const absence of calendar ?? []) {
      if (
        typeof absence.startDate !== "string" ||
        !absence.startDate.startsWith(year)
      )
        continue;
      const existing = summary.get(absence.userName) ?? {
        department: absence.userDepartment,
        days: 0,
        periods: 0,
      };
      existing.days += workingDays(
        absence.startDate,
        absence.endDate,
        absence.halfDay
      );
      existing.periods += 1;
      summary.set(absence.userName, existing);
    }
    return [...summary.entries()].sort(([, a], [, b]) => b.days - a.days);
  }, [calendar, year]);
  return (
    <Card>
      <CardHeader className="border-b border-border/70">
        <CardTitle className="text-base">{t("teamReport", { year })}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("teamReportHint")}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="border-b border-border/70 bg-muted/35 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">{t("employee")}</th>
                <th className="px-5 py-3 font-semibold">{t("department")}</th>
                <th className="px-5 py-3 text-right font-semibold">
                  {t("absencePeriods")}
                </th>
                <th className="px-5 py-3 text-right font-semibold">
                  {t("absenceDays")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, row]) => (
                <tr
                  key={name}
                  className="border-b border-border/70 last:border-0"
                >
                  <td className="px-5 py-3 font-medium">{name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {row.department ?? "-"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.periods}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.days}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClockodoWorkspace({ section }: { section: ClockodoSection }) {
  const t = useTranslations("Absences");
  const router = useRouter();
  const isManager = useIsManager();
  const canManageClockodo = useHasCapability("access_integrations");
  const { absences: mine, refresh } = useMyAbsences();
  const calendarStart = addDaysIso(isoToday(), -31);
  const calendarEnd = addDaysIso(isoToday(), 90);
  const calendar = useAbsencesCalendar(calendarStart, calendarEnd);
  const pending = usePendingAbsenceCount(isManager);

  function exportIcs() {
    const approved = (mine ?? []).filter(
      absence => absence.status === "approved"
    );
    const ics = buildIcs(
      t("title"),
      approved.map(absence => ({
        uid: absence.id,
        title: t(absence.type),
        startDate: absence.startDate,
        endDate: absence.endDate,
        description: absence.reason ?? undefined,
      }))
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
      reports: "/clockodo/reports",
      admin: "/clockodo/admin",
    };
    router.push(href[next]);
  };

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
        <Dashboard
          mine={mine}
          calendar={calendar}
          pending={pending}
          onNavigate={navigate}
        />
      )}
      {section === "timetable" && <Timetable mine={mine} />}
      {section === "requests" && (
        <Requests mine={mine} onExport={exportIcs} onSaved={refresh} />
      )}
      {section === "planner" && <Planner calendar={calendar} />}
      {section === "reports" && isManager && <Reports calendar={calendar} />}
      {section === "admin" && canManageClockodo && (
        <ClockodoIntegrationPage embedded />
      )}
    </ErrorBoundary>
  );
}

export default function ClockodoPage() {
  return <ClockodoWorkspace section="dashboard" />;
}
