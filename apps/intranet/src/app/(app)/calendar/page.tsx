"use client";

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
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
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
        <div className="space-y-3">
          <Input
            placeholder={t("eventTitle")}
            value={title}
            onChange={e => setTitle(e.target.value)}
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
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                onChange={e => setAllDay(e.target.checked)}
              />
              {t("allDay")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guestVisible}
                onChange={e => setGuestVisible(e.target.checked)}
              />
              {t("guestVisible")}
            </label>
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

export default function CalendarPage() {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const isManager = useIsManager();
  const [cursor, setCursor] = useState(() => new Date());

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

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("title")}
        action={isManager ? <EventDialog defaultDate={cursor} /> : undefined}
      />

      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCursor(c => subMonths(c, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCursor(c => addMonths(c, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={() => setCursor(new Date())}>
          {t("today")}
        </Button>
        <span className="ml-2 text-lg font-semibold">
          {cursor.toLocaleDateString(locale, {
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border bg-card text-sm">
        {weekdays.map(d => (
          <div
            key={d}
            className="border-b border-r p-2 text-center text-xs font-medium text-muted-foreground last:border-r-0"
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
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-24 space-y-1 border-b border-r p-1.5 last:border-r-0",
                !inMonth && "bg-muted/30 text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                  isToday && "bg-primary font-semibold text-primary-foreground"
                )}
              >
                {day.getDate()}
              </div>
              {dayEvents.map(e => (
                <div
                  key={e._id}
                  className="truncate rounded bg-primary/15 px-1 py-0.5 text-[11px] text-primary"
                  title={e.title}
                >
                  {!e.allDay && `${format(new Date(e.start), "HH:mm")} `}
                  {e.title}
                </div>
              ))}
              {dayAbsences.map(a => (
                <div
                  key={a._id}
                  className={cn(
                    "truncate rounded px-1 py-0.5 text-[11px]",
                    ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.other
                  )}
                  title={`${a.userName} · ${a.type}`}
                >
                  {a.userName}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
