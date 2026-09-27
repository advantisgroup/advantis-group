"use client";

import { ClockStartPicker } from "@/components/clockodo/ClockStartPicker";
import { DateBadge } from "@/components/clockodo/DateBadge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { useCurrentUser } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { isoToday } from "@/lib/absences";
import {
  type AbsenceStatus,
  type AbsenceType,
  type CalendarAbsence,
  type MyAbsence,
} from "@/lib/absences-api";
import {
  clockStatusClassName,
  elapsedSince,
  useClockodoActions,
  useClockodoClock,
} from "@/lib/clockodo-clock";
import { useEdenApi } from "@/lib/eden";
import { cn } from "@/lib/utils";
import { CircleDashed, Clock3, Link2Off, Plane, Play, Square, Thermometer } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

/** Pieces the Clockodo tabs share: status and type labels, the clock control, the absence dialog. */

export type ClockodoSection =
  | "dashboard"
  | "timetable"
  | "planner"
  | "requests"
  | "approvals"
  | "admin";

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

export function AbsencesSubNav({
  active,
  canManageClockodo,
  onNavigate,
}: {
  active: "requests" | "approvals" | "planner";
  canManageClockodo: boolean;
  onNavigate: (section: ClockodoSection) => void;
}) {
  const t = useTranslations("Absences");
  const items = ABSENCE_SUB_SECTIONS.filter(
    (item) => item.value !== "approvals" || canManageClockodo,
  );

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

/**
 * Isolates one independently-fetched widget so its own crash shows a small
 * inline "this part failed" card instead of taking the rest of the page
 * (other widgets, the tab bar) down with it.
 */
export function SectionBoundary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={({ reset }) => (
        <ErrorFallback title={title} className="min-h-0 py-6" onRetry={reset} />
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
export const TYPE_STYLE: Record<
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

export const ABSENCE_TYPES = Object.keys(TYPE_STYLE) as AbsenceType[];

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

export function formatClockTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export const STATUS_ACCENT: Record<AbsenceStatus, string> = {
  pending: "var(--warn)",
  approved: "var(--ok)",
  denied: "var(--destructive)",
  cancelled: "var(--muted-foreground)",
};

export const ABSENCE_STATUSES = Object.keys(STATUS_ACCENT) as AbsenceStatus[];

export function AbsenceStatusBadge({ status }: { status: AbsenceStatus }) {
  const t = useTranslations("Absences");
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

export function AbsenceTypeLabel({ type }: { type: AbsenceType }) {
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

export function Segmented<T extends string>({
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
            "shrink-0 rounded-md px-3 py-1 text-sm font-medium transition-colors max-md:py-2",
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

export function CalendarBar({
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

export function AbsencePill({ absence }: { absence: MyAbsence }) {
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
export function NoPersonalClockodoAccount({ hint }: { hint: string }) {
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

export function ClockControl() {
  const t = useTranslations("Absences");
  const user = useCurrentUser();
  const { state: clock, now, refresh } = useClockodoClock(!!user.clockodoUserId);
  const actions = useClockodoActions(clock, refresh);

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

export function ClockodoAbsenceDialog({
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
