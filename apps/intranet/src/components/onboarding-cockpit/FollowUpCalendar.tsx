"use client";

import { useState, type DragEvent, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import { type CaseRow, todayIso, useStatusName } from "./shared";

/**
 * The follow-ups of the onboarding cockpit as a calendar (week and day
 * view). Its own calendar, deliberately not the intranet calendar: it shows
 * nothing but follow-ups. Clicking one opens the customer file; dragging
 * one onto another day or hour moves it.
 */

type View = "week" | "day";

/** Hours shown as rows; earlier/later follow-ups land in the first/last. */
const FIRST_HOUR = 7;
const LAST_HOUR = 19;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
const NO_TIME = -1;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week `iso` falls in. */
function weekStart(iso: string): string {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

function hourOf(time: string | null): number {
  if (!time) return NO_TIME;
  const h = Number(time.slice(0, 2));
  return Math.min(LAST_HOUR, Math.max(FIRST_HOUR, h));
}

const DRAG_TYPE = "application/x-onboarding-case";

export function FollowUpCalendar({
  rows,
  onOpen,
  showAssignee,
}: {
  rows: CaseRow[];
  onOpen: (id: Id<"onboardingCases">) => void;
  showAssignee: boolean;
}) {
  const t = useTranslations("OnboardingCockpit");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const update = useMutation(api.performance.onboarding.update);
  const today = todayIso();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(today);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const days =
    view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : [anchor];
  const step = view === "week" ? 7 : 1;
  const overdue = rows.filter((c) => c.nextFollowUp! < today);

  const byCell = new Map<string, CaseRow[]>();
  for (const c of rows) {
    const key = `${c.nextFollowUp}|${hourOf(c.nextFollowUpTime)}`;
    byCell.set(key, [...(byCell.get(key) ?? []), c]);
  }
  for (const list of byCell.values()) {
    list.sort(
      (a, b) =>
        (a.nextFollowUpTime ?? "").localeCompare(b.nextFollowUpTime ?? "") ||
        Number(b.prio) - Number(a.prio),
    );
  }

  const move = async (caseId: string, date: string, hour: number) => {
    const c = rows.find((r) => r._id === caseId);
    if (!c) return;
    const time =
      hour === NO_TIME
        ? null
        : // Keep the minutes when it stays in the same hour slot.
          c.nextFollowUpTime && hourOf(c.nextFollowUpTime) === hour
          ? c.nextFollowUpTime
          : `${String(hour).padStart(2, "0")}:00`;
    if (c.nextFollowUp === date && (c.nextFollowUpTime ?? null) === time) return;
    try {
      await update({
        caseId: c._id,
        nextFollowUp: date,
        nextFollowUpTime: time,
      });
      toast.success(t("calendar.moved"));
    } catch (e) {
      handleError(e, t("case.saveError"));
    }
  };

  const dropProps = (date: string, hour: number) => {
    const key = `${date}|${hour}`;
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((k) => (k === key ? null : k)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDropTarget(null);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) void move(id, date, hour);
      },
      className: cn(dropTarget === key && "bg-primary/10 ring-1 ring-inset ring-primary/40"),
    };
  };

  const title =
    view === "week"
      ? `${new Date(`${days[0]}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${new Date(`${days[6]}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`
      : new Date(`${anchor}T12:00:00Z`).toLocaleDateString(locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });

  const card = (c: CaseRow, wide: boolean) => (
    <CaseChip
      key={c._id}
      c={c}
      wide={wide}
      past={c.nextFollowUp! < today}
      showAssignee={showAssignee}
      onOpen={onOpen}
    />
  );

  return (
    <div className="space-y-3">
      {overdue.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-2 text-sm font-medium text-destructive">
            {t("calendar.overdue", { count: overdue.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            {overdue
              .sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!))
              .map((c) => (
                <CaseChip
                  key={c._id}
                  c={c}
                  wide={false}
                  past
                  showDate
                  showAssignee={showAssignee}
                  onOpen={onOpen}
                />
              ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("calendar.overdueHint")}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t("calendar.prev")}
            onClick={() => setAnchor(addDays(anchor, -step))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t("calendar.next")}
            onClick={() => setAnchor(addDays(anchor, step))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            {t("calendar.today")}
          </Button>
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="ml-auto flex rounded-lg border p-0.5 border-border/70" role="tablist">
          {(["week", "day"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                view === v ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              {t(`calendar.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card border-border/70">
        <div
          className={cn("grid", view === "week" ? "min-w-[900px]" : "min-w-0")}
          style={{
            gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Day headers */}
          <div className="sticky left-0 border-b bg-card border-border/70" />
          {days.map((d) => {
            const date = new Date(`${d}T12:00:00Z`);
            const isToday = d === today;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setAnchor(d);
                  setView("day");
                }}
                className={cn(
                  "border-b border-l px-2 py-2 text-left text-xs hover:bg-muted/50 border-border/70",
                  isToday && "bg-primary/5",
                )}
              >
                <span className="block font-medium uppercase text-muted-foreground">
                  {date.toLocaleDateString(locale, { weekday: "short" })}
                </span>
                <span
                  className={cn("text-base font-semibold tabular-nums", isToday && "text-primary")}
                >
                  {date.toLocaleDateString(locale, { day: "numeric", month: "numeric" })}
                </span>
              </button>
            );
          })}

          {/* Without a time */}
          <Row label={t("calendar.noTime")}>
            {days.map((d) => {
              const props = dropProps(d, NO_TIME);
              return (
                <div
                  key={d}
                  {...props}
                  className={cn(
                    "min-h-[52px] space-y-1 border-b border-l bg-muted/20 p-1 border-border/70",
                    d === today && "bg-primary/5",
                    props.className,
                  )}
                >
                  {(byCell.get(`${d}|${NO_TIME}`) ?? []).map((c) => card(c, view === "day"))}
                </div>
              );
            })}
          </Row>

          {/* Hours */}
          {HOURS.map((h) => (
            <Row key={h} label={`${String(h).padStart(2, "0")}:00`}>
              {days.map((d) => {
                const props = dropProps(d, h);
                return (
                  <div
                    key={d}
                    {...props}
                    className={cn(
                      "min-h-[44px] space-y-1 border-b border-l p-1 border-border/70",
                      d === today && "bg-primary/[0.03]",
                      props.className,
                    )}
                  >
                    {(byCell.get(`${d}|${h}`) ?? []).map((c) => card(c, view === "day"))}
                  </div>
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("calendar.hint")}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="sticky left-0 border-b bg-card px-2 py-1 text-right text-[11px] tabular-nums text-muted-foreground border-border/70">
        {label}
      </div>
      {children}
    </>
  );
}

/** One follow-up: customer number, time, prio and steps; draggable. */
function CaseChip({
  c,
  wide,
  past,
  showDate = false,
  showAssignee,
  onOpen,
}: {
  c: CaseRow;
  wide: boolean;
  past: boolean;
  showDate?: boolean;
  showAssignee: boolean;
  onOpen: (id: Id<"onboardingCases">) => void;
}) {
  const locale = useLocale();
  const statusName = useStatusName();
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, c._id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(c._id)}
      title={c.note ?? undefined}
      className={cn(
        "block w-full cursor-grab rounded-md border border-border/70 bg-background px-2 py-1 text-left text-xs shadow-sm transition-colors hover:border-foreground/40 active:cursor-grabbing",
        c.prio && "border-l-2 border-l-destructive",
        past && "border-destructive/40 bg-destructive/5",
        !wide && showDate && "w-auto",
      )}
    >
      <span className="flex items-center gap-1.5">
        {c.prio && <Flag className="h-3 w-3 shrink-0 text-destructive" />}
        <span className="font-semibold tabular-nums">{c.customerNumber}</span>
        {(c.nextFollowUpTime || showDate) && (
          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
            {showDate &&
              new Date(`${c.nextFollowUp}T12:00:00Z`).toLocaleDateString(locale, {
                day: "numeric",
                month: "numeric",
              })}
            {showDate && c.nextFollowUpTime && " "}
            {c.nextFollowUpTime}
          </span>
        )}
      </span>
      {(wide || showAssignee) && (
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
          {wide && <span>{statusName(c.status)}</span>}
          {showAssignee && c.assigneeName && <span className="truncate">{c.assigneeName}</span>}
        </span>
      )}
      {wide && c.note && (
        <span className="mt-0.5 block truncate text-muted-foreground">{c.note}</span>
      )}
    </button>
  );
}
