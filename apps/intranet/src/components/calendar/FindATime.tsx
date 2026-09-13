"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { useAbsencesCalendar } from "@/lib/absences-api";

const DAYS_AHEAD = 7;
const SLOT_STEP_MIN = 30;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 17;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface Slot {
  start: number;
  end: number;
  out: number;
}

/**
 * The three best free slots in the coming week for an event of this length:
 * no clash with another event, on the days the fewest people in the audience
 * are away, earliest first among equals.
 */
export function FindATime({
  from,
  durationMin,
  audience,
  ignoreEventId,
  onPick,
}: {
  from: Date;
  durationMin: number;
  audience: string;
  ignoreEventId?: string;
  onPick: (slot: Slot) => void;
}) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const rangeStart = useMemo(() => {
    const d = new Date(Math.max(from.getTime(), Date.now()));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [from]);
  const rangeEnd = useMemo(() => {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + DAYS_AHEAD);
    return d;
  }, [rangeStart]);

  const events = useQuery(api.events.listForRange, {
    start: rangeStart.getTime(),
    end: rangeEnd.getTime(),
  });
  const absences = useAbsencesCalendar(isoDay(rangeStart), isoDay(rangeEnd));

  const slots = useMemo(() => {
    if (!events || !absences) return null;
    const busy = events.filter((e) => e._id !== ignoreEventId && !e.allDay);
    const found: Slot[] = [];
    for (let day = 0; day < DAYS_AHEAD; day++) {
      const date = new Date(rangeStart);
      date.setDate(date.getDate() + day);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const iso = isoDay(date);
      const out = absences.filter(
        (a) =>
          a.startDate <= iso &&
          iso <= a.endDate &&
          (audience === "all" || a.userDepartment === audience),
      ).length;
      for (
        let minutes = DAY_START_HOUR * 60;
        minutes + durationMin <= DAY_END_HOUR * 60;
        minutes += SLOT_STEP_MIN
      ) {
        const start = new Date(date);
        start.setHours(0, minutes, 0, 0);
        const end = start.getTime() + durationMin * 60_000;
        if (start.getTime() < Date.now()) continue;
        if (busy.some((e) => e.start < end && e.end > start.getTime())) continue;
        found.push({ start: start.getTime(), end, out });
        break;
      }
    }
    return found.sort((a, b) => a.out - b.out || a.start - b.start).slice(0, 3);
  }, [absences, audience, durationMin, events, ignoreEventId, rangeStart]);

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("findATimeTitle")}</p>
      {slots === null ? (
        <p className="text-sm text-muted-foreground">{t("findATimeLoading")}</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("findATimeNone")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              onClick={() => onPick(slot)}
              className="rounded-lg border border-border/70 px-3 py-2 text-left text-sm transition-colors hover:border-foreground/40 hover:bg-accent/60"
            >
              <span className="block font-medium">
                {new Date(slot.start).toLocaleDateString(locale, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                ·{" "}
                {new Date(slot.start).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="block text-xs text-muted-foreground">
                {slot.out === 0 ? t("findATimeAllIn") : t("findATimeOut", { count: slot.out })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
