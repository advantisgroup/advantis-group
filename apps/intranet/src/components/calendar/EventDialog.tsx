"use client";

import { FindATime } from "@/components/calendar/FindATime";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export interface EventDraft {
  eventId?: Id<"events">;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  audience: string;
}

export function emptyDraft(dateIso?: string): EventDraft {
  return {
    title: "",
    description: "",
    location: "",
    start: dateIso ? `${dateIso}T09:00` : "",
    end: dateIso ? `${dateIso}T10:00` : "",
    allDay: false,
    audience: "all",
  };
}

export function EventDialog({
  draft,
  onOpenChange,
}: {
  draft: EventDraft | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Calendar");
  const tc = useTranslations("Common");
  const create = useMutation(api.events.create);
  const createWeeklySeries = useMutation(api.events.createWeeklySeries);
  const update = useMutation(api.events.update);
  const handleError = useErrorHandler();
  const departments = useQuery(api.people.users.departments) ?? [];
  const [form, setForm] = useState<EventDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [occurrences, setOccurrences] = useState("1");
  const [findOpen, setFindOpen] = useState(false);
  const localInput = (ms: number) => {
    const d = new Date(ms);
    return `${isoDay(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const conflictRange = useMemo(() => {
    if (!form.start || !form.end) return null;
    const start = new Date(form.start);
    const end = new Date(form.end);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end.getTime() <= start.getTime()
    ) {
      return null;
    }
    return {
      start: start.getTime(),
      end: end.getTime(),
      startIso: isoDay(start),
      endIso: isoDay(end),
    };
  }, [form.end, form.start]);
  const conflictingEvents = useQuery(
    api.events.listForRange,
    conflictRange ? { start: conflictRange.start, end: conflictRange.end } : "skip",
  );
  const conflictingAbsences = useAbsencesCalendar(
    conflictRange?.startIso ?? isoDay(new Date()),
    conflictRange?.endIso ?? isoDay(new Date()),
    draft !== null && conflictRange !== null,
  );
  const conflicts = useMemo(() => {
    if (!conflictRange) return null;
    const overlappingEvents = (conflictingEvents ?? []).filter(
      (event) =>
        event._id !== form.eventId &&
        event.start < conflictRange.end &&
        event.end > conflictRange.start,
    ).length;
    const peopleOut = (conflictingAbsences ?? []).filter(
      (absence) =>
        absence.type === "vacation" &&
        (form.audience === "all" || absence.userDepartment === form.audience),
    ).length;
    return { overlappingEvents, peopleOut };
  }, [conflictRange, conflictingAbsences, conflictingEvents, form.audience, form.eventId]);

  useEffect(() => {
    if (draft) {
      setForm(draft);
      setOccurrences("1");
    }
  }, [draft]);

  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (!form.title.trim() || !form.start || !form.end) return;
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      description: form.description || undefined,
      location: form.location || undefined,
      start: new Date(form.start).getTime(),
      end: new Date(form.end).getTime(),
      allDay: form.allDay,
      audience:
        form.audience === "all"
          ? ({ kind: "all" } as const)
          : ({ kind: "department", department: form.audience } as const),
    };
    try {
      if (form.eventId) {
        await update({ eventId: form.eventId, ...payload });
        toast.success(t("updated"));
      } else {
        if (occurrences === "1") {
          await create(payload);
          toast.success(t("addEvent"));
        } else {
          await createWeeklySeries({ ...payload, occurrences: Number(occurrences) });
          toast.success(t("seriesCreated", { count: Number(occurrences) }));
        }
      }
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={draft !== null}
      onOpenChange={onOpenChange}
      title={form.eventId ? t("editEvent") : t("addEvent")}
      description={t("addEventHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !form.title.trim()}>
            {form.eventId ? tc("save") : tc("create")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <Input
            placeholder={t("eventTitle")}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="h-11 text-base font-medium"
          />
          <Input
            placeholder={t("location")}
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
          />
          <Textarea
            placeholder={t("description")}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("start")}</Label>
              <Input
                type="datetime-local"
                value={form.start}
                onChange={(e) => set("start", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("end")}</Label>
              <Input
                type="datetime-local"
                value={form.end}
                onChange={(e) => set("end", e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {!form.allDay && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={findOpen}
                onClick={() => setFindOpen((open) => !open)}
              >
                {t("findATime")}
              </Button>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={form.allDay}
                onChange={(e) => set("allDay", e.target.checked)}
              />
              {t("allDay")}
            </label>
          </div>
          {findOpen && !form.allDay && (
            <FindATime
              from={form.start ? new Date(form.start) : new Date()}
              durationMin={
                conflictRange ? Math.round((conflictRange.end - conflictRange.start) / 60_000) : 60
              }
              audience={form.audience}
              ignoreEventId={form.eventId}
              onPick={(slot) => {
                setForm((f) => ({
                  ...f,
                  start: localInput(slot.start),
                  end: localInput(slot.end),
                }));
                setFindOpen(false);
              }}
            />
          )}
        </div>

        <Select value={form.audience} onValueChange={(v) => set("audience", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tc("all")}</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!form.eventId && (
          <div>
            <Label className="mb-1.5 block">{t("repeatWeekly")}</Label>
            <Select value={occurrences} onValueChange={setOccurrences}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("doesNotRepeat")}</SelectItem>
                {[2, 3, 4, 6, 8, 12].map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {t("weeklyOccurrences", { count })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {conflicts && (conflicts.peopleOut > 0 || conflicts.overlappingEvents > 0) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              {t("planningConflictsTitle")}
            </div>
            <div className="mt-1 space-y-0.5 pl-6 text-xs text-amber-800/80 dark:text-amber-100/80">
              {conflicts.peopleOut > 0 && (
                <p>{t("planningAbsences", { peopleOut: conflicts.peopleOut })}</p>
              )}
              {conflicts.overlappingEvents > 0 && (
                <p>{t("planningEvents", { overlappingEvents: conflicts.overlappingEvents })}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
