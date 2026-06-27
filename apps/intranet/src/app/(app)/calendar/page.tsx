"use client";

import type { ReactNode } from "react";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plane,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";

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
import { formatIsoDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const ABSENCE_COLORS: Record<string, string> = {
  vacation: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  sick: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  personal: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  other: "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300",
};

function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function EventDialog({ defaultDate }: { defaultDate?: Date }) {
  const t = useTranslations("Calendar");
  const tc = useTranslations("Common");
  const create = useMutation(api.events.create);
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
      toast.error(e instanceof Error ? e.message : "Error");
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
            <div className="grid grid-cols-2 gap-3">
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

export default function CalendarPage() {
  const t = useTranslations("Calendar");
  const tc = useTranslations("Common");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const isManager = useIsManager();
  const me = useCurrentUser();
  const confirm = useConfirm();
  const removeEvent = useMutation(api.events.remove);
  const [cursor, setCursor] = useState(() => new Date());
  const [detail, setDetail] = useState<DetailState>(null);

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  );

  const events = useQuery(api.events.listForRange, {
    start: gridStart.getTime(),
    end: gridEnd.getTime(),
  });
  const absences = useQuery(api.absences.listForCalendar, {
    start: isoDay(gridStart),
    end: isoDay(gridEnd),
  });

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
        events: (events ?? []).filter(e => isoDay(new Date(e.start)) === detailDay),
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
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("title")}
        action={isManager ? <EventDialog defaultDate={cursor} /> : undefined}
      />

      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCursor(c => subMonths(c, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCursor(c => addMonths(c, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={() => setCursor(new Date())}>
          {t("today")}
        </Button>
        <span className="ml-2 font-display text-xl font-semibold capitalize tracking-tight">
          {cursor.toLocaleDateString(locale, {
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border/70 bg-card text-sm shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
        {weekdays.map(d => (
          <div
            key={d}
            className="border-b border-r border-border/60 bg-muted/30 p-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
          >
            {d}
          </div>
        ))}
        {days.map(day => {
          const dayIso = isoDay(day);
          const dayEvents =
            events?.filter(e => isSameDay(new Date(e.start), day)) ?? [];
          const dayAbsences =
            absences?.filter(
              a => a.startDate <= dayIso && dayIso <= a.endDate
            ) ?? [];
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          const overflow = dayEvents.length + dayAbsences.length - 3;
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => setDetail({ kind: "day", day: dayIso })}
              className={cn(
                "min-h-24 space-y-1 border-b border-r border-border/60 p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-accent/50",
                !inMonth && "bg-muted/20 text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday && "bg-primary font-semibold text-primary-foreground"
                )}
              >
                {day.getDate()}
              </div>
              {dayEvents.slice(0, 3).map(e => (
                <div
                  key={e._id}
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
              ))}
              {dayAbsences
                .slice(0, Math.max(0, 3 - dayEvents.length))
                .map(a => (
                  <div
                    key={a._id}
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
                      "truncate rounded px-1 py-0.5 text-[11px] font-medium",
                      ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other
                    )}
                    title={`${a.userName} · ${a.type}`}
                  >
                    {a.userName}
                  </div>
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
                (detailEvent.createdByUserId === me._id ||
                  me.role === "admin")
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
