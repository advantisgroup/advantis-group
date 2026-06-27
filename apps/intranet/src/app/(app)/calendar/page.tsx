"use client";

import type { ReactNode } from "react";

import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  List,
  MapPin,
  Plane,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const ABSENCE_COLORS: Record<string, string> = {
  vacation: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  sick: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  personal: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  other: "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300",
};

const ABSENCE_DOTS: Record<string, string> = {
  vacation: "bg-sky-500",
  sick: "bg-rose-500",
  personal: "bg-violet-500",
  other: "bg-zinc-500",
};

const ABSENCE_TYPES = ["vacation", "sick", "personal", "other"] as const;

function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function EventDialog({ defaultDate }: { defaultDate?: Date }) {
  const t = useTranslations("Calendar");
  const tc = useTranslations("Common");
  const create = useMutation(api.events.create);
  const handleError = useErrorHandler();
  const departments = useQuery(api.users.departments) ?? [];
  const [open, setOpen] = useState(false);
  const base = defaultDate ? format(defaultDate, "yyyy-MM-dd") : "";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(base ? `${base}T09:00` : "");
  const [end, setEnd] = useState(base ? `${base}T10:00` : "");
  const [allDay, setAllDay] = useState(false);
  const [audience, setAudience] = useState("all");
  const [guestVisible, setGuestVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !start || !end) return;
    setBusy(true);
    try {
      await create({
        title: title.trim(),
        description: description || undefined,
        location: location || undefined,
        start: new Date(start).getTime(),
        end: new Date(end).getTime(),
        allDay,
        audience:
          audience === "all"
            ? { kind: "all" }
            : { kind: "department", department: audience },
        guestVisible,
      });
      toast.success(t("addEvent"));
      setOpen(false);
      setTitle("");
      setDescription("");
      setLocation("");
      setGuestVisible(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("addEvent")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addEvent")}</DialogTitle>
          <DialogDescription>{t("addEventHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-3">
            <Input
              placeholder={t("eventTitle")}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-11 text-base font-medium"
            />
            <Input
              placeholder={t("location")}
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
            <Textarea
              placeholder={t("description")}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("start")}</Label>
                <Input
                  type="datetime-local"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("end")}</Label>
                <Input
                  type="datetime-local"
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={allDay}
                  onChange={e => setAllDay(e.target.checked)}
                />
                {t("allDay")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={guestVisible}
                  onChange={e => setGuestVisible(e.target.checked)}
                />
                {t("guestVisible")}
              </label>
            </div>
          </div>

          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc("all")}</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DetailState =
  | { kind: "day"; day: string }
  | { kind: "event"; id: Id<"events"> }
  | { kind: "absence"; id: Id<"absences"> }
  | null;

type CalendarView = "month" | "week" | "list";

export default function CalendarPage() {
  const t = useTranslations("Calendar");
  const tc = useTranslations("Common");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const isManager = useIsManager();
  const me = useCurrentUser();
  const confirm = useConfirm();
  const removeEvent = useMutation(api.events.remove);
  const handleError = useErrorHandler();
  const [cursor, setCursor] = useState(() => new Date());
  const [detail, setDetail] = useState<DetailState>(null);
  const [view, setView] = useState<CalendarView>("month");

  // The dense month grid is hard to read on phones, so default to the agenda
  // (list) view there. Runs once on mount; users can still switch freely.
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      setView("list");
    }
  }, []);

  // The queried range depends on the active view: the month grid spans whole
  // weeks; the week view a single week; the agenda the whole month.
  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "week") {
    rangeStart = startOfWeek(cursor, { weekStartsOn: 1 });
    rangeEnd = endOfWeek(cursor, { weekStartsOn: 1 });
  } else if (view === "list") {
    rangeStart = startOfMonth(cursor);
    rangeEnd = endOfMonth(cursor);
  } else {
    rangeStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    rangeEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  }

  const gridDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const events = useQuery(api.events.listForRange, {
    start: rangeStart.getTime(),
    end: rangeEnd.getTime(),
  });
  const absences = useQuery(api.absences.listForCalendar, {
    start: isoDay(rangeStart),
    end: isoDay(rangeEnd),
  });

  function goPrev() {
    setCursor(c => (view === "week" ? subWeeks(c, 1) : subMonths(c, 1)));
  }
  function goNext() {
    setCursor(c => (view === "week" ? addWeeks(c, 1) : addMonths(c, 1)));
  }

  const weekdays = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      new Date(monday.getTime() + i * 86400000).toLocaleDateString(locale, {
        weekday: "short",
      })
    );
  }, [locale]);

  type CalEvent = NonNullable<typeof events>[number];
  type CalAbsence = NonNullable<typeof absences>[number];

  const detailEvent =
    detail?.kind === "event"
      ? events?.find(e => e._id === detail.id)
      : undefined;
  const detailAbsence =
    detail?.kind === "absence"
      ? absences?.find(a => a._id === detail.id)
      : undefined;
  const detailDay = detail?.kind === "day" ? detail.day : null;
  const dayEntries = detailDay
    ? {
        events: (events ?? []).filter(
          e => isoDay(new Date(e.start)) === detailDay
        ),
        absences: (absences ?? []).filter(
          a => a.startDate <= detailDay && detailDay <= a.endDate
        ),
      }
    : null;

  function longDate(d: Date | string) {
    const date = typeof d === "string" ? new Date(`${d}T00:00`) : d;
    return date.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function eventWhen(e: CalEvent) {
    if (e.allDay) return `${longDate(new Date(e.start))} · ${t("allDay")}`;
    return `${longDate(new Date(e.start))} · ${formatTime(e.start, locale)} – ${formatTime(e.end, locale)}`;
  }

  async function onDeleteEvent(id: Id<"events">) {
    const ok = await confirm({
      title: t("deleteEvent"),
      description: tc("deleteWarning"),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await removeEvent({ eventId: id });
      setDetail(null);
      toast.success(tc("delete"));
    } catch (e) {
      handleError(e);
    }
  }

  function eventsOn(day: Date): CalEvent[] {
    return events?.filter(e => isSameDay(new Date(e.start), day)) ?? [];
  }
  function absencesOn(day: Date): CalAbsence[] {
    const iso = isoDay(day);
    return absences?.filter(a => a.startDate <= iso && iso <= a.endDate) ?? [];
  }

  const headerLabel =
    view === "week"
      ? `${rangeStart.toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
        })} – ${rangeEnd.toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`
      : cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });

  // Only days that actually have entries, for the agenda view.
  const agendaDays = gridDays
    .map(day => ({
      day,
      dayEvents: eventsOn(day),
      dayAbsences: absencesOn(day),
    }))
    .filter(d => d.dayEvents.length > 0 || d.dayAbsences.length > 0);

  function EventChip({ e }: { e: CalEvent }) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={ev => {
          ev.stopPropagation();
          setDetail({ kind: "event", id: e._id });
        }}
        onKeyDown={ev => {
          if (ev.key === "Enter") {
            ev.stopPropagation();
            setDetail({ kind: "event", id: e._id });
          }
        }}
        className="flex items-center gap-1 truncate rounded bg-primary/15 px-1 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/25"
        title={e.title}
      >
        {!e.allDay && (
          <span className="tabular-nums opacity-70">
            {format(new Date(e.start), "HH:mm")}
          </span>
        )}
        <span className="truncate">{e.title}</span>
      </div>
    );
  }

  function AbsenceChip({ a }: { a: CalAbsence }) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={ev => {
          ev.stopPropagation();
          setDetail({ kind: "absence", id: a._id });
        }}
        onKeyDown={ev => {
          if (ev.key === "Enter") {
            ev.stopPropagation();
            setDetail({ kind: "absence", id: a._id });
          }
        }}
        className={cn(
          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium",
          ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other
        )}
        title={`${a.userName} · ${tAbs(a.type)}`}
      >
        <Plane className="size-3 shrink-0 opacity-70" />
        <span className="truncate">
          {firstName(a.userName)} · {tAbs(a.type)}
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("title")}
        action={isManager ? <EventDialog defaultDate={cursor} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={goPrev}
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={goNext}
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={() => setCursor(new Date())}>
          {t("today")}
        </Button>
        <span className="ml-1 font-display text-xl font-semibold capitalize tracking-tight">
          {headerLabel}
        </span>

        {/* View switcher */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { key: "month", label: t("viewMonth"), icon: CalendarDays },
              { key: "week", label: t("viewWeek"), icon: CalendarRange },
              { key: "list", label: t("viewList"), icon: List },
            ] as const
          ).map(v => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                aria-pressed={view === v.key}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  view === v.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="font-medium">{t("legend")}:</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" />
          {t("event")}
        </span>
        {ABSENCE_TYPES.map(ty => (
          <span key={ty} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", ABSENCE_DOTS[ty])} />
            {tAbs(ty)}
          </span>
        ))}
      </div>

      {/* Month grid */}
      {view === "month" && (
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border/70 bg-card text-sm shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
          {weekdays.map(d => (
            <div
              key={d}
              className="border-b border-r border-border/60 bg-muted/30 p-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
            >
              {d}
            </div>
          ))}
          {gridDays.map(day => {
            const dayEvents = eventsOn(day);
            const dayAbsences = absencesOn(day);
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, new Date());
            const overflow = dayEvents.length + dayAbsences.length - 3;
            return (
              <button
                type="button"
                key={day.toISOString()}
                onClick={() => setDetail({ kind: "day", day: isoDay(day) })}
                className={cn(
                  "min-h-24 space-y-1 border-b border-r border-border/60 p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-accent/50",
                  !inMonth && "bg-muted/20 text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday &&
                      "bg-primary font-semibold text-primary-foreground"
                  )}
                >
                  {day.getDate()}
                </div>
                {dayEvents.slice(0, 3).map(e => (
                  <EventChip key={e._id} e={e} />
                ))}
                {dayAbsences
                  .slice(0, Math.max(0, 3 - dayEvents.length))
                  .map(a => (
                    <AbsenceChip key={a._id} a={a} />
                  ))}
                {overflow > 0 && (
                  <div className="px-1 text-[10px] font-medium text-muted-foreground">
                    +{overflow}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Week view — one column per day, all entries listed */}
      {view === "week" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {gridDays.map(day => {
            const dayEvents = eventsOn(day);
            const dayAbsences = absencesOn(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex min-h-48 flex-col rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]",
                  isToday && "border-primary/40 ring-1 ring-primary/20"
                )}
              >
                <button
                  type="button"
                  onClick={() => setDetail({ kind: "day", day: isoDay(day) })}
                  className="flex items-center justify-between border-b border-border/60 px-2.5 py-2 text-left hover:bg-accent/40"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {day.toLocaleDateString(locale, { weekday: "short" })}
                  </span>
                  <span
                    className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold",
                      isToday && "bg-primary text-primary-foreground"
                    )}
                  >
                    {day.getDate()}
                  </span>
                </button>
                <div className="flex-1 space-y-1 p-1.5">
                  {dayEvents.length === 0 && dayAbsences.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-muted-foreground/70">
                      {t("noEntries")}
                    </p>
                  ) : (
                    <>
                      {dayEvents.map(e => (
                        <EventChip key={e._id} e={e} />
                      ))}
                      {dayAbsences.map(a => (
                        <AbsenceChip key={a._id} a={a} />
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agenda / list view */}
      {view === "list" && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
          {agendaDays.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <CalendarClock className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("noUpcoming")}</p>
            </div>
          ) : (
            agendaDays.map(({ day, dayEvents, dayAbsences }) => (
              <div
                key={day.toISOString()}
                className="flex gap-4 border-b border-border/60 px-4 py-3 last:border-b-0"
              >
                <div className="w-28 shrink-0">
                  <p
                    className={cn(
                      "text-sm font-semibold capitalize",
                      isSameDay(day, new Date()) && "text-primary"
                    )}
                  >
                    {day.toLocaleDateString(locale, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {dayEvents.map(e => (
                    <button
                      key={e._id}
                      onClick={() => setDetail({ kind: "event", id: e._id })}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CalendarClock className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {e.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {e.allDay
                          ? t("allDay")
                          : `${formatTime(e.start, locale)}`}
                      </span>
                    </button>
                  ))}
                  {dayAbsences.map(a => (
                    <button
                      key={a._id}
                      onClick={() => setDetail({ kind: "absence", id: a._id })}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md",
                          ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other
                        )}
                      >
                        <Plane className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {a.userName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {tAbs(a.type)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Detail dialog (Google-Calendar style) */}
      <Dialog open={detail !== null} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent>
          {/* Day overview */}
          {detailDay && dayEntries && (
            <>
              <DialogHeader>
                <DialogTitle className="capitalize">
                  {longDate(detailDay)}
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                {dayEntries.events.length === 0 &&
                dayEntries.absences.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <CalendarClock className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t("noEntries")}
                    </p>
                  </div>
                ) : (
                  <>
                    {dayEntries.events.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("events")}
                        </p>
                        {dayEntries.events.map(e => (
                          <button
                            key={e._id}
                            onClick={() =>
                              setDetail({ kind: "event", id: e._id })
                            }
                            className="flex w-full items-center gap-3 rounded-lg border border-border/70 p-2.5 text-left transition-colors hover:bg-accent"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <CalendarClock className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {e.title}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {e.allDay
                                  ? t("allDay")
                                  : `${formatTime(e.start, locale)} – ${formatTime(e.end, locale)}`}
                                {e.location ? ` · ${e.location}` : ""}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {dayEntries.absences.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("absences")}
                        </p>
                        {dayEntries.absences.map(a => (
                          <button
                            key={a._id}
                            onClick={() =>
                              setDetail({ kind: "absence", id: a._id })
                            }
                            className="flex w-full items-center gap-3 rounded-lg border border-border/70 p-2.5 text-left transition-colors hover:bg-accent"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <Plane className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {a.userName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {tAbs(a.type)}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* Single event */}
          {detailEvent && (
            <EventDetail
              event={detailEvent}
              when={eventWhen(detailEvent)}
              canDelete={
                isManager &&
                (detailEvent.createdByUserId === me._id || me.role === "admin")
              }
              onDelete={() => onDeleteEvent(detailEvent._id)}
            />
          )}

          {/* Single absence */}
          {detailAbsence && (
            <AbsenceDetail
              absence={detailAbsence}
              typeLabel={tAbs(detailAbsence.type)}
              range={`${formatIsoDate(detailAbsence.startDate, locale)} – ${formatIsoDate(detailAbsence.endDate, locale)}${detailAbsence.halfDay ? " · ½" : ""}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  function DetailRow({
    icon,
    children,
  }: {
    icon: ReactNode;
    children: ReactNode;
  }) {
    return (
      <div className="flex items-start gap-3 text-sm">
        <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
        <span className="min-w-0 flex-1">{children}</span>
      </div>
    );
  }

  function EventDetail({
    event,
    when,
    canDelete,
    onDelete,
  }: {
    event: CalEvent;
    when: string;
    canDelete: boolean;
    onDelete: () => void;
  }) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <DetailRow icon={<CalendarClock />}>{when}</DetailRow>
          {event.location && (
            <DetailRow icon={<MapPin />}>{event.location}</DetailRow>
          )}
          <DetailRow icon={<User />}>
            <span className="text-muted-foreground">{t("organizer")}: </span>
            {event.createdByName}
          </DetailRow>
          {event.description && (
            <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
              {event.description}
            </p>
          )}
        </div>
        <DialogFooter>
          {canDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              {tc("delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setDetail(null)}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  function AbsenceDetail({
    absence,
    typeLabel,
    range,
  }: {
    absence: CalAbsence;
    typeLabel: string;
    range: string;
  }) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{absence.userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <DetailRow icon={<Plane />}>
            <Badge
              variant="muted"
              className={ABSENCE_COLORS[absence.type] ?? ABSENCE_COLORS.other}
            >
              {typeLabel}
            </Badge>
          </DetailRow>
          <DetailRow icon={<CalendarClock />}>{range}</DetailRow>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDetail(null)}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </>
    );
  }
}
