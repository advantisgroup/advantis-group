"use client";

import { CalendarClock, History, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/activity/i18n";

/**
 * Day-context strip for the timeline. Two jobs, never both at once:
 *  - viewing a PAST day  → a clear "you're looking at <date>, not today" banner
 *    with a one-click way back to today.
 *  - viewing TODAY with no data yet → a quiet nudge offering to rewind to the
 *    most recent day that actually has data.
 * Renders nothing when today is selected and has data.
 */
export function DayNav({
  selectedDay,
  today,
  isToday,
  hasDataToday,
  lastActive,
  onSelectDay,
}: {
  selectedDay: string;
  today: string;
  isToday: boolean;
  hasDataToday: boolean;
  lastActive: string | null;
  onSelectDay: (day: string) => void;
}) {
  const { t, lang } = useI18n();
  const fmt = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(lang, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  // Viewing a past day — prominent, unmistakable.
  if (!isToday) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-signal/30 bg-signal/10 px-4 py-3 animate-fade-up">
        <CalendarClock className="h-4 w-4 shrink-0 text-signal" />
        <p className="min-w-0 flex-1 text-sm text-fg">
          {t("timeline.day.viewingPast", { date: fmt(selectedDay) })}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSelectDay(today)}
          className="shrink-0"
        >
          <X className="h-3.5 w-3.5" />
          {t("timeline.day.backToToday")}
        </Button>
      </div>
    );
  }

  // Today, but nothing recorded yet — offer a rewind to the last active day.
  if (!hasDataToday && lastActive && lastActive !== today) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel-2/60 px-4 py-3 animate-fade-up">
        <History className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {t("timeline.day.noDataToday")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSelectDay(lastActive)}
          className="shrink-0"
        >
          <History className="h-3.5 w-3.5" />
          {t("timeline.day.rewind", { date: fmt(lastActive) })}
        </Button>
      </div>
    );
  }

  return null;
}
