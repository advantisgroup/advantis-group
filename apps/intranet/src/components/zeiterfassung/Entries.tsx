"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { addDays, addMonths, monthEnd, monthOf, monthStart, mondayOf } from "@advantis/convex/time";
import { useMutation } from "convex/react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Download,
  Lock,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Undo2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteEntryDialog, EntryDialog } from "@/components/zeiterfassung/EntryDialogs";
import { AbsenceTypeLabel, Chip, Segmented, WarningChips } from "@/components/zeiterfassung/parts";
import { type DayView, type TimeEntry, useDays } from "@/components/zeiterfassung/use-days";
import { downloadFile } from "@/lib/export";
import { cn } from "@/lib/utils";
import {
  type AbsenceType,
  formatClock,
  formatDay,
  formatMinutes,
  formatMonth,
  useBerlinToday,
  useNow,
  bookedByPhone,
  useTimeErrorToast,
  useTimeMode,
} from "@/lib/zeiterfassung";

type View = "week" | "month";

/**
 * Booked time, a week or a month at a time: per day the segments, worked vs
 * target, warnings and flags; changes open a dialog. Used for your own time
 * and, with `userId`, by admins for someone else's.
 */
export function Entries({
  userId,
  direct,
  initialDate,
  personName,
}: {
  userId?: Id<"users">;
  /** Changes apply directly (admins) instead of becoming requests. */
  direct: boolean;
  initialDate?: string | null;
  personName?: string;
}) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const today = useBerlinToday();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(initialDate ?? today);
  const [open, setOpen] = useState<string | null>(initialDate ?? today);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const { readOnly } = useTimeMode();

  const from = view === "week" ? mondayOf(anchor) : monthStart(monthOf(anchor));
  const to = view === "week" ? addDays(from, 6) : monthEnd(monthOf(anchor));
  const { days } = useDays(userId, from, to);
  const totals = useMemo(
    () =>
      (days ?? [])
        .filter((day) => day.date <= today)
        .reduce(
          (sum, day) => ({
            worked: sum.worked + day.workedMinutes,
            target: sum.target + day.targetMinutes,
          }),
          { worked: 0, target: 0 },
        ),
    [days, today],
  );

  const shift = (direction: 1 | -1) =>
    setAnchor(
      view === "week"
        ? addDays(from, 7 * direction)
        : `${addMonths(monthOf(anchor), direction)}-01`,
    );

  const title =
    view === "week"
      ? `${formatDay(from, locale, { day: "2-digit", month: "2-digit" })} – ${formatDay(
          to,
          locale,
          {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          },
        )}`
      : formatMonth(monthOf(anchor), locale);

  function exportCsv() {
    if (!days) return;
    const header = [
      t("csv.date"),
      t("csv.start"),
      t("csv.end"),
      t("csv.breaks"),
      t("csv.worked"),
      t("csv.target"),
      t("csv.difference"),
      t("csv.absence"),
      t("csv.holiday"),
      t("csv.notes"),
    ];
    const cell = (value: string) =>
      /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const rows = days.map((day) =>
      [
        day.date,
        day.firstStart ? formatClock(day.firstStart, "de-DE") : "",
        day.lastEnd && !day.open ? formatClock(day.lastEnd, "de-DE") : "",
        formatMinutes(day.breakMinutes),
        formatMinutes(day.workedMinutes),
        formatMinutes(day.targetMinutes),
        formatMinutes(day.workedMinutes - day.targetMinutes, true),
        day.absenceTypes.map((type) => t(`absenceType.${type as AbsenceType}`)).join(", "),
        day.holiday?.name ?? "",
        [
          ...day.warnings.map((warning) => t(`warnings.${warning}.label`)),
          ...(day.autoClosed ? [t("entries.autoClosed")] : []),
          ...(bookedByPhone(day.entries) ? [t("entries.mobile")] : []),
        ].join(", "),
      ]
        .map(cell)
        .join(";"),
    );
    const name = `arbeitszeiten-${personName ? `${personName.replace(/\s+/g, "-").toLowerCase()}-` : ""}${from}_${to}.csv`;
    downloadFile(name, "text/csv;charset=utf-8", `﻿${[header.join(";"), ...rows].join("\r\n")}`);
    toast.success(t("csv.done"));
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("entries.previous")}
            onClick={() => shift(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("entries.next")}
            onClick={() => shift(1)}
          >
            <ChevronRight />
          </Button>
          <div className="ml-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {days && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("entries.totals", {
                  worked: formatMinutes(totals.worked),
                  target: formatMinutes(totals.target),
                  diff: formatMinutes(totals.worked - totals.target, true),
                })}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "week", label: t("entries.week") },
              { value: "month", label: t("entries.month") },
            ]}
          />
          {anchor !== today && (
            <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
              {t("entries.today")}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!days}>
            <Download />
            <span className="max-sm:sr-only">{t("csv.export")}</span>
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={() => setAdding(open ?? today)}>
              <Plus />
              {t("entries.add")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {days === undefined ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {days.map((day) => (
              <DayRow
                key={day.date}
                day={day}
                today={today}
                expanded={open === day.date}
                onToggle={() => setOpen(open === day.date ? null : day.date)}
                onAdd={() => setAdding(day.date)}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <EntryDialog
        open={adding !== null || editing !== null}
        onOpenChange={(value) => {
          if (!value) {
            setAdding(null);
            setEditing(null);
          }
        }}
        entry={editing}
        defaultDate={adding ?? today}
        userId={userId}
        direct={direct}
      />
      <DeleteEntryDialog
        entry={deleting}
        onOpenChange={(value) => !value && setDeleting(null)}
        direct={direct}
      />
    </Card>
  );
}

function DayRow({
  day,
  today,
  expanded,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}: {
  day: DayView;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
}) {
  const t = useTranslations("Zeiterfassung");
  const locale = useLocale();
  const now = useNow(30_000);
  const withdraw = useMutation(api.time.entries.withdraw);
  const { readOnly } = useTimeMode();
  const showError = useTimeErrorToast();
  const active = day.entries.filter((row) => row.status === "active");
  const requests = day.entries.filter(
    (row) => row.status === "pending" || row.status === "rejected",
  );
  const quiet = active.length === 0 && requests.length === 0 && day.targetMinutes === 0;
  const future = day.date > today;
  const diff = day.workedMinutes - day.targetMinutes;

  return (
    <li className={cn(quiet && "bg-muted/20")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
      >
        <span
          className={cn(
            "w-20 shrink-0 text-sm font-medium tabular-nums",
            day.date === today && "text-primary",
            quiet && "text-muted-foreground",
          )}
        >
          {formatDay(day.date, locale)}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
          {active.length > 0 && day.firstStart !== null && (
            <span className="tabular-nums text-muted-foreground">
              {formatClock(day.firstStart, locale)} –{" "}
              {day.open ? t("entries.running") : formatClock(day.lastEnd!, locale)}
            </span>
          )}
          {day.holiday && <Chip tone="info">{day.holiday.name}</Chip>}
          {day.absenceTypes.map((type) => (
            <Chip key={type}>
              <AbsenceTypeLabel type={type as AbsenceType} />
            </Chip>
          ))}
          {day.autoClosed && (
            <Chip tone="warn" hint={t("entries.autoClosedHint")}>
              {t("entries.autoClosed")}
            </Chip>
          )}
          {bookedByPhone(active) && (
            <Chip tone="info" hint={t("entries.mobileHint")}>
              <Smartphone className="size-3" />
              {t("entries.mobile")}
            </Chip>
          )}
          {day.pending > 0 && <Chip>{t("entries.pendingChip", { count: day.pending })}</Chip>}
          {day.locked && (
            <Chip hint={t("entries.lockedHint")}>
              <Lock className="size-3" />
              {t("entries.locked")}
            </Chip>
          )}
          <WarningChips warnings={day.warnings} />
        </span>
        <span className="hidden shrink-0 text-right text-sm tabular-nums sm:block">
          {day.workedMinutes > 0 || day.targetMinutes > 0 ? (
            <>
              <span className="font-medium">
                {future && day.workedMinutes === 0 ? "–" : formatMinutes(day.workedMinutes)}
              </span>
              <span className="text-muted-foreground"> / {formatMinutes(day.targetMinutes)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </span>
        <span
          className={cn(
            "w-14 shrink-0 text-right text-xs tabular-nums",
            future || (day.workedMinutes === 0 && day.targetMinutes === 0)
              ? "text-transparent"
              : diff < 0
                ? "text-warn"
                : "text-ok",
          )}
        >
          {formatMinutes(diff, true)}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="space-y-1.5 bg-muted/20 px-4 pb-4 pt-1">
          <p className="text-xs text-muted-foreground sm:hidden">
            {t("entries.workedOfTarget", {
              worked: formatMinutes(day.workedMinutes),
              target: formatMinutes(day.targetMinutes),
            })}
          </p>
          {active.length === 0 && requests.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">{t("entries.noEntries")}</p>
          )}
          {active
            .sort((a, b) => a.start - b.start)
            .map((row) => (
              <div
                key={row._id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2",
                  row.kind === "work"
                    ? "border-l-2 border-l-primary/60 bg-card"
                    : "border-dashed bg-card/60 text-muted-foreground",
                )}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm tabular-nums">
                    {row.kind === "break" && <Coffee className="size-3.5" />}
                    {formatClock(row.start, locale)} –{" "}
                    {row.end ? formatClock(row.end, locale) : t("entries.running")}
                    <span className="text-muted-foreground">
                      {formatMinutes(Math.round(((row.end ?? now) - row.start) / 60_000))}
                    </span>
                  </p>
                  {(row.note || row.source !== "clock" || bookedByPhone([row])) && (
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {bookedByPhone([row]) && <Smartphone className="size-3 shrink-0 text-info" />}
                      {[
                        t(`entries.source.${row.source}`),
                        row.startDevice === "mobile" && row.endDevice === "mobile"
                          ? t("entries.mobileBoth")
                          : row.startDevice === "mobile"
                            ? t("entries.mobileStart")
                            : row.endDevice === "mobile"
                              ? t("entries.mobileEnd")
                              : null,
                        row.note,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                {!readOnly && row.end !== undefined && !day.locked && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("entries.edit")}
                      onClick={() => onEdit(row)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("entries.delete")}
                      onClick={() => onDelete(row)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          {requests.map((row) => (
            <div
              key={row._id}
              className="flex items-center justify-between gap-3 rounded-md border border-dashed border-warn/40 bg-warn/5 px-3 py-2"
            >
              <div className="min-w-0 text-sm">
                <p className="tabular-nums">
                  <span className="font-medium">
                    {t(`entries.request.${row.correctionAction ?? "add"}`)}
                  </span>{" "}
                  {formatClock(row.start, locale)} – {row.end ? formatClock(row.end, locale) : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.status === "rejected"
                    ? [t("entries.rejected"), row.decisionNote].filter(Boolean).join(" · ")
                    : [t("entries.waiting"), row.reason].filter(Boolean).join(" · ")}
                </p>
              </div>
              {!readOnly && row.status === "pending" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void withdraw({ entryId: row._id })
                      .then(() => toast.success(t("entries.withdrawn")))
                      .catch(showError)
                  }
                >
                  <Undo2 />
                  {t("entries.withdraw")}
                </Button>
              )}
            </div>
          ))}
          {!readOnly && !day.locked && !future && (
            <Button variant="ghost" size="sm" onClick={onAdd} className="mt-1">
              <Plus />
              {t("entries.addForDay")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function entriesInitialDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
