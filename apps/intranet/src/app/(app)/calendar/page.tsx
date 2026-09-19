"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  CalendarArrowDown,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  List,
  Pencil,
  Plane,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  EventDialog,
  type EventDraft,
  emptyDraft,
  isoDay,
} from "@/components/calendar/EventDialog";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonLink } from "@/components/profile/PersonLink";
import { isOwnerOrAdmin, useCurrentUser, useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { FilterPill, TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidePanel, SidePanelProperties, SidePanelSection } from "@/components/ui/side-panel";
import { useDeepLinkId } from "@/hooks/use-deep-link-id";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { formatIsoDate, formatTime } from "@/lib/format";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { formatRichDate } from "@/lib/rich-date";
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

const ABSENCE_ACCENT: Record<string, string> = {
  vacation: "var(--color-sky-500)",
  sick: "var(--color-rose-500)",
  personal: "var(--color-violet-500)",
  other: "var(--color-zinc-500)",
};

const ABSENCE_TYPES = ["vacation", "sick", "personal", "other"] as const;

// Department-targeted events get a stable color per department name so teams
// can tell their events apart from company-wide (primary-colored) ones.
const DEPT_PALETTE = [
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

const DEPT_ACCENTS = [
  "var(--color-emerald-500)",
  "var(--color-amber-500)",
  "var(--color-cyan-500)",
  "var(--color-fuchsia-500)",
  "var(--color-indigo-500)",
  "var(--color-teal-500)",
];

function deptIndex(department: string): number {
  let hash = 0;
  for (let i = 0; i < department.length; i++) {
    hash = (hash * 31 + department.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % DEPT_PALETTE.length;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

type Audience = { kind: "all" } | { kind: "department"; department: string };
type DetailState =
  | { kind: "day"; day: string }
  | { kind: "event"; id: Id<"events"> }
  | { kind: "absence"; id: string }
  | null;

type CalendarView = "month" | "week" | "list";

type FilterKind = "event" | (typeof ABSENCE_TYPES)[number];
const ALL_KINDS: FilterKind[] = ["event", ...ABSENCE_TYPES];

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
  const departments = useQuery(api.people.users.departments) ?? [];
  const prefs = useQuery(api.people.preferences.getMine);
  const [cursor, setCursor] = useState(() => new Date());
  const [detail, setDetail] = useState<DetailState>(null);
  const [view, setView] = useState<CalendarView>("month");
  const prefViewApplied = useRef(false);

  const weekStartsOn = prefs?.weekStartsOn === "sunday" ? 0 : 1;

  // A saved default view (settings) wins over the mobile agenda fallback.
  useEffect(() => {
    if (prefs === undefined || prefViewApplied.current) return;
    prefViewApplied.current = true;
    if (prefs?.defaultCalendarView) setView(prefs.defaultCalendarView);
  }, [prefs]);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<FilterKind>>(new Set());
  const [deptFilter, setDeptFilter] = useState("all");
  const [onlyMyAbsences, setOnlyMyAbsences] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The dense month grid is hard to read on phones, so default to the agenda
  // (list) view there. Runs once on mount; users can still switch freely.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setView("list");
    }
  }, []);

  // Deep link from the dashboard quick action: /calendar?new=1 opens the
  // event dialog straight away (managers only — the mutation is gated anyway).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== null) {
      setEventDraft(emptyDraft(isoDay(new Date())));
      window.history.replaceState(null, "", "/calendar");
    }
  }, []);

  // Deep link from a notification/dashboard widget: /calendar?event=<id> or
  // ?absence=<id> opens the matching detail dialog directly.
  const deepLinkEventId = useDeepLinkId("event");
  const deepLinkAbsenceId = useDeepLinkId("absence");
  useEffect(() => {
    if (deepLinkEventId) {
      setDetail({ kind: "event", id: deepLinkEventId as Id<"events"> });
    }
  }, [deepLinkEventId]);
  useEffect(() => {
    if (deepLinkAbsenceId) {
      setDetail({ kind: "absence", id: deepLinkAbsenceId });
    }
  }, [deepLinkAbsenceId]);

  // The queried range depends on the active view: the month grid spans whole
  // weeks; the week view a single week; the agenda the whole month.
  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "week") {
    rangeStart = startOfWeek(cursor, { weekStartsOn });
    rangeEnd = endOfWeek(cursor, { weekStartsOn });
  } else if (view === "list") {
    rangeStart = startOfMonth(cursor);
    rangeEnd = endOfMonth(cursor);
  } else {
    rangeStart = startOfWeek(startOfMonth(cursor), { weekStartsOn });
    rangeEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn });
  }

  const gridDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const events = useQuery(api.events.listForRange, {
    start: rangeStart.getTime(),
    end: rangeEnd.getTime(),
  });
  const absences = useAbsencesCalendar(isoDay(rangeStart), isoDay(rangeEnd));

  const goPrev = useCallback(() => {
    setCursor((c) => (view === "week" ? subWeeks(c, 1) : subMonths(c, 1)));
  }, [view]);
  const goNext = useCallback(() => {
    setCursor((c) => (view === "week" ? addWeeks(c, 1) : addMonths(c, 1)));
  }, [view]);

  // Arrow keys page through periods, "t" jumps to today — unless a dialog is
  // open or the focus sits in a form control.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (detail !== null || eventDraft !== null) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key.toLowerCase() === "t") setCursor(new Date());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, eventDraft, goPrev, goNext]);

  const weekdays = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) =>
      new Date(monday.getTime() + i * 86400000).toLocaleDateString(locale, {
        weekday: "short",
      }),
    );
  }, [locale, weekStartsOn]);

  type CalEvent = NonNullable<typeof events>[number];
  type CalAbsence = NonNullable<typeof absences>[number];

  const filteredEvents = useMemo(() => {
    if (!events) return undefined;
    return events.filter((e) => {
      if (hiddenKinds.has("event")) return false;
      if (deptFilter !== "all") {
        const audience = e.audience as Audience;
        if (audience.kind === "department" && audience.department !== deptFilter) return false;
      }
      return true;
    });
  }, [events, hiddenKinds, deptFilter]);

  const filteredAbsences = useMemo(() => {
    if (!absences) return undefined;
    return absences.filter((a) => {
      if (hiddenKinds.has(a.type as FilterKind)) return false;
      if (onlyMyAbsences && a.userId !== me._id) return false;
      if (deptFilter !== "all" && a.userDepartment !== deptFilter) return false;
      return true;
    });
  }, [absences, hiddenKinds, onlyMyAbsences, deptFilter, me._id]);

  const detailEvent =
    detail?.kind === "event" ? events?.find((e) => e._id === detail.id) : undefined;
  const detailAbsence =
    detail?.kind === "absence" ? absences?.find((a) => a.id === detail.id) : undefined;
  const detailDay = detail?.kind === "day" ? detail.day : null;
  const dayEntries = detailDay
    ? {
        events: (filteredEvents ?? []).filter(
          (e) => eventDay(e, e.start) <= detailDay && detailDay <= eventDay(e, e.end),
        ),
        absences: (filteredAbsences ?? []).filter(
          (a) => a.startDate <= detailDay && detailDay <= a.endDate,
        ),
      }
    : null;
  const canEditDetail =
    !!detailEvent && isManager && isOwnerOrAdmin(me, detailEvent.createdByUserId);
  const canDeleteDetail =
    !!detailEvent && (detailEvent.personalForUserId === me._id || canEditDetail);
  const canDuplicateDetail = !!detailEvent && isManager && !detailEvent.personalForUserId;

  function longDate(d: Date | string) {
    const date = typeof d === "string" ? new Date(`${d}T00:00`) : d;
    return date.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function absenceRange(a: CalAbsence) {
    return `${formatIsoDate(a.startDate, locale)} – ${formatIsoDate(a.endDate, locale)}${a.halfDay ? " · ½" : ""}`;
  }

  function eventWhen(e: CalEvent) {
    if (e.personalForUserId) {
      return `${formatRichDate(
        {
          startAt: e.start,
          ...(e.end !== e.start ? { endAt: e.end } : {}),
          allDay: e.allDay,
        },
        locale,
      )}${e.allDay ? ` · ${t("allDay")}` : ""}`;
    }
    if (e.allDay) {
      const start = longDate(new Date(e.start));
      const end =
        isoDay(new Date(e.end)) === isoDay(new Date(e.start))
          ? ""
          : ` – ${longDate(new Date(e.end))}`;
      return `${start}${end} · ${t("allDay")}`;
    }
    return `${longDate(new Date(e.start))} · ${formatTime(e.start, locale)} – ${formatTime(e.end, locale)}`;
  }

  function eventDay(e: CalEvent, timestamp: number): string {
    return e.allDay && e.personalForUserId
      ? new Date(timestamp).toISOString().slice(0, 10)
      : isoDay(new Date(timestamp));
  }

  function eventIcs(e: CalEvent) {
    return {
      uid: e._id,
      title: e.title,
      ...(e.allDay
        ? {
            startDate: eventDay(e, e.start),
            endDate: eventDay(e, e.end),
          }
        : { startMs: e.start, endMs: e.end }),
      description: e.description ?? undefined,
      location: e.location ?? undefined,
      categories: e.kind ? [e.kind.toUpperCase()] : undefined,
    };
  }

  function downloadEventIcs(event: CalEvent) {
    const filename =
      event.title
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "") || "event";
    downloadIcs(`${filename}.ics`, buildIcs(t("title"), [eventIcs(event)]));
    toast.success(t("exported"));
  }

  async function onDeleteEvent(event: CalEvent) {
    const ok = await confirm({
      title: t("deleteEvent"),
      description: tc("deleteWarning"),
      details: [
        { label: t("eventTitle"), value: event.title },
        { label: t("start"), value: eventWhen(event) },
        ...(event.location ? [{ label: t("location"), value: event.location }] : []),
      ],
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    try {
      await removeEvent({ eventId: event._id });
      setDetail(null);
      toast.success(tc("delete"));
    } catch (e) {
      handleError(e);
    }
  }

  function draftFromEvent(e: CalEvent, duplicate = false): EventDraft {
    const audience = e.audience as Audience;
    return {
      eventId: duplicate ? undefined : e._id,
      title: e.title,
      description: e.description ?? "",
      location: e.location ?? "",
      start: format(new Date(e.start), "yyyy-MM-dd'T'HH:mm"),
      end: format(new Date(e.end), "yyyy-MM-dd'T'HH:mm"),
      allDay: e.allDay,
      audience: audience.kind === "all" ? "all" : audience.department,
    };
  }

  // Multi-day events render on every day they cover (not just the start day).
  function eventsOn(day: Date): CalEvent[] {
    const iso = isoDay(day);
    return (
      filteredEvents?.filter((e) => eventDay(e, e.start) <= iso && iso <= eventDay(e, e.end)) ?? []
    );
  }
  function absencesOn(day: Date): CalAbsence[] {
    const iso = isoDay(day);
    return filteredAbsences?.filter((a) => a.startDate <= iso && iso <= a.endDate) ?? [];
  }

  function exportIcs() {
    const ics = buildIcs(t("title"), [
      ...(filteredEvents ?? []).map((e) => ({
        ...eventIcs(e),
      })),
      ...(filteredAbsences ?? []).map((a) => ({
        uid: a.id,
        title: `${a.userName} · ${tAbs(a.type)}`,
        startDate: a.startDate,
        endDate: a.endDate,
      })),
    ]);
    downloadIcs(`calendar-${format(cursor, "yyyy-MM")}.ics`, ics);
    toast.success(t("exported"));
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
    .map((day) => ({
      day,
      dayEvents: eventsOn(day),
      dayAbsences: absencesOn(day),
    }))
    .filter((d) => d.dayEvents.length > 0 || d.dayAbsences.length > 0);

  function toggleKind(kind: FilterKind) {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function eventChipClass(e: CalEvent) {
    const audience = e.audience as Audience;
    if (audience.kind === "department")
      return cn(DEPT_PALETTE[deptIndex(audience.department)], "hover:opacity-80");
    return "bg-primary/15 text-primary hover:bg-primary/25";
  }

  function eventAccent(e: CalEvent) {
    const audience = e.audience as Audience;
    return audience.kind === "department"
      ? DEPT_ACCENTS[deptIndex(audience.department)]
      : "var(--primary)";
  }

  function audienceLabel(e: CalEvent) {
    const audience = e.audience as Audience;
    return audience.kind === "department" ? audience.department : tc("all");
  }

  function EventChip({ e, day }: { e: CalEvent; day?: Date }) {
    const continues = day ? eventDay(e, e.start) !== isoDay(day) : false;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(ev) => {
          ev.stopPropagation();
          setDetail({ kind: "event", id: e._id });
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.stopPropagation();
            setDetail({ kind: "event", id: e._id });
          }
        }}
        className={cn(
          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium",
          eventChipClass(e),
          continues && "opacity-75",
        )}
        title={e.title}
      >
        {continues ? (
          <ChevronRight className="size-3 shrink-0 opacity-70" />
        ) : (
          !e.allDay && (
            <span className="tabular-nums opacity-70">{format(new Date(e.start), "HH:mm")}</span>
          )
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
        onClick={(ev) => {
          ev.stopPropagation();
          setDetail({ kind: "absence", id: a.id });
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.stopPropagation();
            setDetail({ kind: "absence", id: a.id });
          }
        }}
        className={cn(
          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium",
          ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other,
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
    <div className="mx-auto max-w-5xl" data-tour="tour-calendar-view">
      <PageHeaderBar title={t("title")} tourCheckpoint="calendar" />
      <PageHeaderActions
        actions={[
          {
            key: "export",
            label: t("exportIcs"),
            icon: CalendarArrowDown,
            onClick: exportIcs,
            variant: "outline",
          },
          ...(isManager
            ? [
                {
                  key: "add-event",
                  label: t("addEvent"),
                  icon: Plus,
                  onClick: () => setEventDraft(emptyDraft(isoDay(cursor))),
                  tourTarget: "tour-calendar-add",
                },
              ]
            : []),
        ]}
      />

      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 max-md:sticky max-md:top-0 max-md:z-10 max-md:-mx-1 max-md:bg-background/95 max-md:px-1 max-md:py-2 max-md:backdrop-blur"
        data-tour="tour-calendar-toolbar"
      >
        {/* Left: the period is the heading; navigation sits beneath it as a
            grouped, secondary control cluster. */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-[8rem] font-display text-2xl font-semibold capitalize tracking-tight">
            {headerLabel}
          </h2>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-border bg-card">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goPrev}
                aria-label={tc("previous")}
                className="rounded-r-none"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span aria-hidden className="h-5 w-px bg-border" />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goNext}
                aria-label={tc("next")}
                className="rounded-l-none"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
              {t("today")}
            </Button>
            <Input
              type="date"
              aria-label={t("jumpToDate")}
              value={format(cursor, "yyyy-MM-dd")}
              onChange={(e) => {
                if (e.target.value) setCursor(new Date(`${e.target.value}T12:00`));
              }}
              className="hidden h-8 w-[8.75rem] text-xs md:flex"
            />
          </div>
        </div>

        {/* View switcher */}
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-card p-1 md:flex refreshed:gap-0 refreshed:border-border/70 refreshed:bg-muted/40 refreshed:p-0.5">
          {(
            [
              { key: "month", label: t("viewMonth"), icon: CalendarDays },
              { key: "week", label: t("viewWeek"), icon: CalendarRange },
              { key: "list", label: t("viewList"), icon: List },
            ] as const
          ).map((v) => {
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
                    ? "bg-primary/10 text-primary refreshed:bg-card refreshed:text-foreground refreshed:shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground refreshed:hover:bg-transparent",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex w-full items-center gap-2 md:hidden">
          <Select value={view} onValueChange={(value) => setView(value as CalendarView)}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t("viewMonth")}</SelectItem>
              <SelectItem value="week">{t("viewWeek")}</SelectItem>
              <SelectItem value="list">{t("viewList")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="default"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal />
            {t("filters")}
          </Button>
        </div>
      </div>

      {/* Interactive legend: click a type to hide/show it, narrow to a
          department, or keep only your own absences. */}
      <div
        className="mb-4 hidden flex-wrap items-center gap-2 md:flex"
        data-tour="tour-calendar-filters"
      >
        <FilterPill
          label={t("type")}
          options={ALL_KINDS.map((kind) => ({
            value: kind,
            label: kind === "event" ? t("event") : tAbs(kind),
            leading: (
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  kind === "event" ? "bg-primary" : ABSENCE_DOTS[kind],
                )}
              />
            ),
          }))}
          selected={
            hiddenKinds.size === 0 ? [] : ALL_KINDS.filter((kind) => !hiddenKinds.has(kind))
          }
          onChange={(next) =>
            setHiddenKinds(
              new Set<FilterKind>(
                next.length === 0 ? [] : ALL_KINDS.filter((kind) => !next.includes(kind)),
              ),
            )
          }
          clearLabel={t("clearFilter", { label: t("type") })}
        />
        {departments.length > 0 && (
          <FilterPill
            label={t("department")}
            options={departments.map((d) => ({ value: d, label: d }))}
            selected={deptFilter === "all" ? [] : [deptFilter]}
            onChange={(next) => setDeptFilter(next.find((d) => d !== deptFilter) ?? "all")}
            clearLabel={t("clearFilter", { label: t("department") })}
          />
        )}
        <TogglePill active={onlyMyAbsences} onClick={() => setOnlyMyAbsences((v) => !v)}>
          {t("onlyMyAbsences")}
        </TogglePill>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {ALL_KINDS.filter((kind) => !hiddenKinds.has(kind)).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  kind === "event" ? "bg-primary" : ABSENCE_DOTS[kind],
                )}
              />
              {kind === "event" ? t("event") : tAbs(kind)}
            </span>
          ))}
        </div>
      </div>

      <ResponsiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={t("filters")}
        footer={<Button onClick={() => setFiltersOpen(false)}>{tc("done")}</Button>}
      >
        <button
          type="button"
          aria-pressed={onlyMyAbsences}
          onClick={() => setOnlyMyAbsences((value) => !value)}
          className={cn(
            "flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors",
            onlyMyAbsences
              ? "border-transparent bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {t("onlyMyAbsences")}
        </button>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("legend")}</p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_KINDS.map((kind) => {
              const hidden = hiddenKinds.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => toggleKind(kind)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors hover:bg-accent",
                    hidden
                      ? "border-border text-muted-foreground/50"
                      : "border-primary/30 bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      kind === "event" ? "bg-primary" : ABSENCE_DOTS[kind],
                      hidden && "opacity-40",
                    )}
                  />
                  {kind === "event" ? t("event") : tAbs(kind)}
                </button>
              );
            })}
          </div>
        </div>

        {departments.length > 0 && (
          <div className="space-y-2">
            <Label>{t("allDepartments")}</Label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDepartments")}</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department} value={department}>
                    {department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </ResponsiveDialog>

      {/* Month grid (leading column: ISO week numbers) */}
      {view === "month" && (
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border/70 bg-card text-sm shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] md:grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] refreshed:shadow-none">
          <div className="hidden border-b border-r border-border/60 bg-muted/30 p-2 text-center text-[10px] font-semibold uppercase text-muted-foreground/70 md:block">
            {t("weekShort")}
          </div>
          {weekdays.map((d) => (
            <div
              key={d}
              className="border-b border-r border-border/60 bg-muted/30 p-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0 refreshed:bg-muted/40 refreshed:font-medium refreshed:normal-case refreshed:tracking-normal"
            >
              {d}
            </div>
          ))}
          {gridDays.map((day, i) => {
            const dayEvents = eventsOn(day);
            const dayAbsences = absencesOn(day);
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, new Date());
            const shownEvents = dayEvents.slice(0, 3);
            const absenceSlots = Math.max(0, 3 - shownEvents.length);
            const aggregateAbsences = dayAbsences.length > absenceSlots && dayAbsences.length > 1;
            const eventOverflow = dayEvents.length - shownEvents.length;
            return (
              <Fragment key={day.toISOString()}>
                {i % 7 === 0 && (
                  <div className="hidden items-start justify-center border-b border-r border-border/60 bg-muted/20 pt-2 text-[10px] font-medium tabular-nums text-muted-foreground/70 md:flex">
                    {getISOWeek(day)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setDetail({ kind: "day", day: isoDay(day) })}
                  className={cn(
                    "min-h-20 space-y-1 border-b border-r border-border/60 p-1 text-left align-top transition-colors last:border-r-0 hover:bg-accent/50 md:min-h-24 md:p-1.5",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday &&
                        "bg-primary font-semibold text-primary-foreground refreshed:bg-foreground refreshed:text-background",
                    )}
                  >
                    {day.getDate()}
                  </div>
                  <div className="flex flex-wrap gap-1 md:hidden">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span key={event._id} className="size-1.5 rounded-full bg-primary" />
                    ))}
                    {dayAbsences.slice(0, Math.max(0, 2 - dayEvents.length)).map((absence) => (
                      <span
                        key={absence.id}
                        className={cn("size-1.5 rounded-full", ABSENCE_DOTS[absence.type])}
                      />
                    ))}
                  </div>
                  <div className="hidden space-y-1 md:block">
                    {shownEvents.map((e) => (
                      <EventChip key={e._id} e={e} day={day} />
                    ))}
                    {aggregateAbsences ? (
                      <div className="flex items-center gap-1 truncate rounded bg-muted px-1 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <Plane className="size-3 shrink-0 opacity-70" />
                        {t("outCount", { count: dayAbsences.length })}
                      </div>
                    ) : (
                      dayAbsences
                        .slice(0, absenceSlots)
                        .map((a) => <AbsenceChip key={a.id} a={a} />)
                    )}
                    {eventOverflow > 0 && (
                      <div className="px-1 text-[10px] font-medium text-muted-foreground">
                        +{eventOverflow}
                      </div>
                    )}
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>
      )}

      {/* Week view — one column per day, all entries listed */}
      {view === "week" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {gridDays.map((day) => {
            const dayEvents = eventsOn(day);
            const dayAbsences = absencesOn(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex min-h-48 flex-col rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] refreshed:shadow-none",
                  isToday &&
                    "border-primary/40 ring-1 ring-primary/20 refreshed:border-foreground/30 refreshed:ring-0",
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
                      isToday &&
                        "bg-primary text-primary-foreground refreshed:bg-foreground refreshed:text-background",
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
                      {dayEvents.map((e) => (
                        <EventChip key={e._id} e={e} day={day} />
                      ))}
                      {dayAbsences.map((a) => (
                        <AbsenceChip key={a.id} a={a} />
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
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] refreshed:shadow-none">
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
                <div className="w-20 shrink-0 sm:w-28">
                  <p
                    className={cn(
                      "text-sm font-semibold capitalize",
                      isSameDay(day, new Date()) && "text-primary",
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
                  {dayEvents.map((e) => (
                    <button
                      key={e._id}
                      onClick={() => setDetail({ kind: "event", id: e._id })}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CalendarClock className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {e.allDay ? t("allDay") : `${formatTime(e.start, locale)}`}
                      </span>
                    </button>
                  ))}
                  {dayAbsences.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setDetail({ kind: "absence", id: a.id })}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md",
                          ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other,
                        )}
                      >
                        <Plane className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {a.userName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{tAbs(a.type)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <SidePanel
        open={detail !== null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={
          detailEvent?.title ??
          detailAbsence?.userName ??
          (detailDay ? longDate(detailDay) : t("title"))
        }
        accent={
          detailEvent
            ? eventAccent(detailEvent)
            : detailAbsence
              ? ABSENCE_ACCENT[detailAbsence.type]
              : undefined
        }
        closeLabel={tc("close")}
        header={
          <div className="space-y-1 pr-8">
            {detailEvent && (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: eventAccent(detailEvent) }}
                  />
                  {t("event")}
                </span>
                <h2 className="text-lg font-semibold leading-snug tracking-tight">
                  {detailEvent.title}
                </h2>
                <p className="text-sm text-muted-foreground">{eventWhen(detailEvent)}</p>
              </>
            )}
            {detailAbsence && (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: ABSENCE_ACCENT[detailAbsence.type] }}
                  />
                  {t("absence")}
                </span>
                <h2 className="text-lg font-semibold leading-snug tracking-tight">
                  <PersonLink userId={detailAbsence.userId as Id<"users">}>
                    {detailAbsence.userName}
                  </PersonLink>
                </h2>
                <p className="text-sm text-muted-foreground">{absenceRange(detailAbsence)}</p>
              </>
            )}
            {detailDay && (
              <h2 className="text-lg font-semibold capitalize leading-snug tracking-tight">
                {longDate(detailDay)}
              </h2>
            )}
          </div>
        }
      >
        {detailEvent && (
          <>
            <SidePanelSection title={t("details")}>
              <SidePanelProperties
                rows={[
                  ...(detailEvent.location
                    ? [{ label: t("location"), value: detailEvent.location }]
                    : []),
                  {
                    label: t("organizer"),
                    value: (
                      <PersonLink userId={detailEvent.createdByUserId}>
                        {detailEvent.createdByName}
                      </PersonLink>
                    ),
                  },
                  ...(detailEvent.personalForUserId
                    ? []
                    : [{ label: t("audience"), value: audienceLabel(detailEvent) }]),
                ]}
              />
            </SidePanelSection>
            {detailEvent.description && (
              <SidePanelSection title={t("description")}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {detailEvent.description}
                </p>
              </SidePanelSection>
            )}
            <SidePanelSection title={t("actions")}>
              <div className="flex flex-wrap gap-2">
                {canEditDetail && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetail(null);
                      setEventDraft(draftFromEvent(detailEvent));
                    }}
                  >
                    <Pencil />
                    {t("editEvent")}
                  </Button>
                )}
                {canDuplicateDetail && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetail(null);
                      setEventDraft(draftFromEvent(detailEvent, true));
                    }}
                  >
                    <Copy />
                    {t("duplicate")}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => downloadEventIcs(detailEvent)}>
                  <CalendarArrowDown />
                  {t("downloadEventIcs")}
                </Button>
                {canDeleteDetail && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void onDeleteEvent(detailEvent)}
                  >
                    <Trash2 />
                    {tc("delete")}
                  </Button>
                )}
              </div>
            </SidePanelSection>
          </>
        )}

        {detailAbsence && (
          <SidePanelSection title={t("details")}>
            <SidePanelProperties
              rows={[
                { label: t("type"), value: tAbs(detailAbsence.type) },
                { label: t("period"), value: absenceRange(detailAbsence) },
                ...(detailAbsence.userDepartment
                  ? [{ label: t("department"), value: detailAbsence.userDepartment }]
                  : []),
              ]}
            />
          </SidePanelSection>
        )}

        {detailDay && dayEntries && (
          <>
            <SidePanelSection
              title={t("events")}
              action={
                isManager && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setDetail(null);
                      setEventDraft(emptyDraft(detailDay));
                    }}
                  >
                    <Plus />
                    {t("addEvent")}
                  </Button>
                )
              }
            >
              {dayEntries.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
              ) : (
                <div className="-mx-2 space-y-0.5">
                  {dayEntries.events.map((e) => (
                    <button
                      key={e._id}
                      type="button"
                      onClick={() => setDetail({ kind: "event", id: e._id })}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ background: eventAccent(e) }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {e.allDay
                            ? t("allDay")
                            : `${formatTime(e.start, locale)} – ${formatTime(e.end, locale)}`}
                          {e.location ? ` · ${e.location}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SidePanelSection>
            {dayEntries.absences.length > 0 && (
              <SidePanelSection title={t("absences")}>
                <div className="-mx-2 space-y-0.5">
                  {dayEntries.absences.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setDetail({ kind: "absence", id: a.id })}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: ABSENCE_ACCENT[a.type] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {a.userName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{tAbs(a.type)}</span>
                    </button>
                  ))}
                </div>
              </SidePanelSection>
            )}
          </>
        )}
      </SidePanel>

      <EventDialog draft={eventDraft} onOpenChange={(open) => !open && setEventDraft(null)} />
    </div>
  );
}
