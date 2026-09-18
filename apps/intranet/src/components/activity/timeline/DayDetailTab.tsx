"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { StateStripLegend } from "@/components/activity/charts/StateStrip";
import { StateTimelineChart } from "@/components/activity/charts/StateTimelineChart";
import { STATE_COLOR } from "@/components/activity/charts/theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  dayStateSegments,
  minuteStates,
  STATE_NAMES,
  type StateName,
} from "@/lib/activity/activity";
import { hhmm, nowMs } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";

const DAY_MS = 86_400_000;

/**
 * "Day in detail": a horizontal colour-coded state strip plus a per-minute grid
 * (24 rows × 60 cells) for one chosen day. Hover any block/cell to read the exact
 * state and time. Owns its date selection and fetches that day's state history.
 */
export function DayDetailTab({
  employeeId,
  today,
  day,
  onSelectDay,
}: {
  employeeId: string | null;
  today: string;
  /** Selected day (YYYY-MM-DD), shared with the rest of the timeline via `?day=`. */
  day: string;
  onSelectDay: (day: string) => void;
}) {
  const { t } = useI18n();

  // Local midnight → next midnight for the selected day.
  const dayStart = useMemo(() => new Date(`${day}T00:00:00`).getTime(), [day]);
  const dayEnd = dayStart + DAY_MS;
  // For today, don't render past the current moment — avoids extending the last
  // known state into future minutes and showing future hours as "active".
  const effectiveDayEnd = day === today ? Math.min(dayEnd, nowMs()) : dayEnd;

  const history = useQuery(
    api.activity.state.history,
    employeeId ? { employeeId, since: dayStart, until: dayEnd } : "skip",
  );

  const { segments, minutes } = useMemo(() => {
    // The backend prepends the prior-day state so past days render correctly
    // across midnight. For today, that row would extend yesterday's state from
    // 00:00 even if work hadn't started yet — filter it out.
    const rows = (history ?? []).filter((r) => day !== today || r.at >= dayStart);
    return {
      segments: dayStateSegments(rows, dayStart, effectiveDayEnd),
      minutes: minuteStates(rows, dayStart, effectiveDayEnd),
    };
  }, [history, dayStart, effectiveDayEnd, day, today]);

  const stateLabel = (s: StateName) => t(`empstate.${s}`);

  return (
    <Card className="animate-fade-up">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("timeline.day.heading")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("timeline.day.sub")}</p>
          </div>
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-auto">
            {t("timeline.day.date")}
            <Input
              type="date"
              value={day}
              max={today}
              onChange={(e) => onSelectDay(e.target.value || today)}
              className="w-full sm:w-40"
            />
          </label>
        </div>
        {/* Legend */}
        <StateStripLegend states={STATE_NAMES} label={stateLabel} />
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        {!employeeId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("timeline.hourly.unlinked")}
          </p>
        ) : history === undefined ? (
          <Skeleton className="h-72 w-full" />
        ) : segments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("timeline.day.empty")}
          </p>
        ) : (
          <div className="space-y-5">
            {/* ── Horizontal day strip ── */}
            <StateTimelineChart segments={segments} label={stateLabel} />

            {/* ── Per-minute grid (24 rows × 60 minutes) ── */}
            <div className="space-y-0.5">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {String(h).padStart(2, "0")}
                  </span>
                  <div className="flex flex-1 gap-px">
                    {Array.from({ length: 60 }, (_, m) => {
                      const idx = h * 60 + m;
                      const st = minutes[idx] ?? null;
                      return (
                        <span
                          key={m}
                          className="h-3 flex-1 rounded-[1px]"
                          style={{
                            background: st ? STATE_COLOR[st] : "var(--muted)",
                          }}
                          title={
                            st
                              ? `${hhmm(dayStart + idx * 60_000)} · ${stateLabel(st)}`
                              : hhmm(dayStart + idx * 60_000)
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
