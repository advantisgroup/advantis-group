"use client";

import { use, useMemo } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";

import {
  StateStrip,
  StateStripLegend,
} from "@/components/activity/charts/StateStrip";
import { SourceSignals } from "@/components/activity/state/StateBits";
import { StatusSummary } from "@/components/activity/state/StatusSummary";
import { ChartsTab } from "@/components/activity/timeline/ChartsTab";
import { DayDetailTab } from "@/components/activity/timeline/DayDetailTab";
import { DayNav } from "@/components/activity/timeline/DayNav";
import { RawTab } from "@/components/activity/timeline/RawTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  dailyTrend,
  dayStateSegments,
  hourlyStateBreakdown,
  lastActiveDay,
  timelineCharts,
  STATE_NAMES,
  type Sample,
  type StateName,
} from "@/lib/activity/activity";
import {
  formatDuration,
  formatRelativeTime,
  nowMs,
  todayLocalDay,
} from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { useTabParam } from "@/lib/activity/useTabParam";
import { useDayParam } from "@/lib/activity/useDayParam";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportTab } from "@/components/activity/timeline/ExportTab";

const TREND_DAYS = 14;

export default function TimelinePage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId: rawDeviceId } = use(params);
  const { t, lang } = useI18n();
  const [tab, setTab] = useTabParam("charts");
  const deviceId = decodeURIComponent(rawDeviceId);

  const samples = useQuery(api.activity.stats.recentSamples, {
    deviceId,
    limit: 1000,
  });
  const today = todayLocalDay();
  // The day the charts are scoped to (URL `?day=`; defaults to today). Drives
  // every per-day view so a stale device never shows old data as "today".
  const [selectedDay, setSelectedDay] = useDayParam(today);
  const isToday = selectedDay === today;

  const startDay = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (TREND_DAYS - 1));
    return d.toISOString().slice(0, 10);
  }, [today]);
  const daily = useQuery(api.activity.stats.dailyRange, {
    deviceId,
    startDay,
    endDay: today,
  });
  const team = useQuery(api.activity.stats.teamOverview);

  const device = team?.find(d => d.deviceId === deviceId) ?? null;
  const dayStats = daily?.find(d => d.day === selectedDay);
  const employeeId = device?.personEmployeeId ?? null;

  // Local midnight → next local midnight for the selected day (epoch ms).
  const { dayStartMs, dayEndMs } = useMemo(() => {
    const start = new Date(`${selectedDay}T00:00:00`).getTime();
    return { dayStartMs: start, dayEndMs: start + 86_400_000 };
  }, [selectedDay]);

  // Fused state for the linked employee + the selected day's state-change
  // history (open-ended for today so it runs up to "now").
  const liveState = useQuery(
    api.activity.state.get,
    employeeId ? { employeeId } : "skip"
  );
  const stateHistory = useQuery(
    api.activity.state.history,
    employeeId
      ? { employeeId, since: dayStartMs, until: isToday ? undefined : dayEndMs }
      : "skip"
  );

  // Aggregations (memoised; samples can be up to 1000 rows).
  const { trend, heatmap, intraday, hourlyStates, daySegments, lastActive } =
    useMemo(() => {
      const tzOffset = new Date().getTimezoneOffset();
      const s: Sample[] = samples ?? [];
      const { heatmap, intraday } = timelineCharts(s, selectedDay, tzOffset);
      // For *today* strip the prepended prior-day row (it would credit
      // yesterday's state to hours 00-NN before work started). For a past day
      // we keep it so the strip fills from that day's midnight.
      const dayHistory = (stateHistory ?? []).filter(
        x => !isToday || x.at >= dayStartMs
      );
      const windowEnd = isToday ? nowMs() : dayEndMs;
      return {
        trend: dailyTrend(daily ?? [], startDay, today),
        heatmap,
        intraday,
        lastActive: lastActiveDay(s, tzOffset),
        hourlyStates: hourlyStateBreakdown(
          dayHistory,
          dayStartMs,
          windowEnd,
          tzOffset
        ),
        daySegments: dayStateSegments(dayHistory, dayStartMs, windowEnd),
      };
    }, [
      samples,
      daily,
      startDay,
      today,
      selectedDay,
      isToday,
      stateHistory,
      dayStartMs,
      dayEndMs,
    ]);

  // Localised state labels for the hourly chart legend/tooltip.
  const stateLabels = useMemo(
    () =>
      Object.fromEntries(
        STATE_NAMES.map(s => [s, t(`empstate.${s}`)])
      ) as Record<StateName, string>,
    [t]
  );

  if (samples === undefined) {
    return (
      <section className="space-y-5">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </section>
    );
  }

  const title = device?.personName ?? device?.hostname ?? deviceId;
  const fileLabel = device?.personName ?? device?.hostname ?? deviceId;
  // Short label for the selected day, e.g. "26.06." / "06/26" — appended to the
  // state-timeline heading when the user has rewound to a past day.
  const shortDate = new Date(`${selectedDay}T00:00:00`).toLocaleDateString(
    lang,
    { day: "2-digit", month: "2-digit" }
  );
  // Whether the selected day has anything to show (raw samples or a daily row).
  const hasDataToday = intraday.length > 0 || dayStats != null;

  // Derived figures for the "right now" card's descriptive numbers + strip.
  const activeSeconds = dayStats?.activeSeconds ?? 0;
  const idleSeconds = dayStats?.idleSeconds ?? 0;
  const trackedSeconds = activeSeconds + idleSeconds;
  const activeShare =
    trackedSeconds > 0
      ? Math.round((activeSeconds / trackedSeconds) * 100)
      : null;
  // Only legend the states that actually occur in the day, ordered canonically.
  const presentStates = STATE_NAMES.filter(s =>
    daySegments.some(seg => seg.state === s)
  );
  // "Now" marker position on the strip (today only).
  const nowPct = isToday ? ((nowMs() - dayStartMs) / 86_400_000) * 100 : null;
  const stateLabel = (s: StateName) => t(`empstate.${s}`);

  return (
    <section className="space-y-6">
      <Link
        href="/admin/activity"
        className="group inline-flex items-center gap-1 text-sm text-signal"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        {t("timeline.back")}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {deviceId}
        </p>
      </div>

      {/* "Right now" — a descriptive section, not bare number tiles: the verdict
          in plain words, the day's active/idle described in a sentence,
          connectivity, and (for linked devices) the per-source breakdown. */}
      {device && (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="text-base">
              {t("timeline.now.heading")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 sm:pt-0">
            <div className="grid gap-5 lg:grid-cols-2">
              {/* LEFT — the plain-language description + per-source breakdown. */}
              <div className="space-y-3">
                <StatusSummary
                  size="lg"
                  status={{
                    online: device.online,
                    deviceIdle: device.deviceIdle,
                    idleSeconds:
                      device.stateIdleSeconds ??
                      (device.idleMs != null
                        ? Math.round(device.idleMs / 1000)
                        : null),
                    genesysRoutingStatus: device.genesysRoutingStatus,
                    genesysWrapUp: device.genesysWrapUp,
                    clockodoWorking: device.clockodoWorking,
                    clockodoBreak: device.clockodoBreak,
                    clockodoAbsent: device.clockodoAbsent,
                    active: device.active,
                  }}
                />

                <p className="text-xs text-muted-foreground">
                  <span
                    className={
                      device.online
                        ? "font-medium text-ok"
                        : "font-medium text-muted-foreground"
                    }
                  >
                    {device.online
                      ? t("timeline.online")
                      : t("timeline.offline")}
                  </span>
                  {" · "}
                  {t("overview.lastSeen")}{" "}
                  <span className="font-medium text-fg/80">
                    {formatRelativeTime(device.lastSeen, lang)}
                  </span>
                </p>

                {employeeId && (
                  <div className="border-t border-border-soft pt-3">
                    {liveState === undefined ? (
                      <Skeleton className="h-20 w-full" />
                    ) : liveState === null ? (
                      <p className="py-1 text-sm text-muted-foreground">
                        {t("timeline.state.empty")}
                      </p>
                    ) : (
                      <>
                        <SourceSignals
                          deviceIdle={liveState.deviceIdle ?? null}
                          genesysRoutingStatus={
                            liveState.genesysRoutingStatus ?? null
                          }
                          genesysPresence={liveState.genesysPresence ?? null}
                          clockodoWorking={liveState.clockodoWorking ?? null}
                          clockodoBreak={liveState.clockodoBreak ?? null}
                          clockodoAbsent={liveState.clockodoAbsent ?? null}
                        />
                        <p className="mt-3 border-t border-border-soft pt-2.5 font-mono text-[11px] text-muted-foreground">
                          {t("state.updated")}{" "}
                          <span className="text-fg/80">
                            {formatRelativeTime(liveState.updatedAt, lang)}
                          </span>
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT — descriptive numbers + the day's state timeline, filling
                  the space the verdict alone used to leave empty. */}
              <div className="space-y-4 lg:border-l lg:border-border-soft lg:pl-5">
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <div>
                    <p className="kicker">{t("common.active")}</p>
                    <p className="text-xl font-semibold tabular-nums text-ok">
                      {formatDuration(activeSeconds, lang)}
                    </p>
                  </div>
                  <div>
                    <p className="kicker">{t("common.idle")}</p>
                    <p className="text-xl font-semibold tabular-nums text-warn">
                      {formatDuration(idleSeconds, lang)}
                    </p>
                  </div>
                  {activeShare != null && (
                    <div>
                      <p className="kicker">{t("timeline.now.activeShare")}</p>
                      <p className="text-xl font-semibold tabular-nums text-fg">
                        {activeShare}%
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="kicker mb-2">
                    {t("timeline.now.dayTimeline")}
                    {!isToday && ` · ${shortDate}`}
                  </p>
                  {!employeeId ? (
                    <p className="text-sm text-muted-foreground">
                      {t("timeline.hourly.unlinked")}
                    </p>
                  ) : stateHistory === undefined ? (
                    <Skeleton className="h-12 w-full" />
                  ) : daySegments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("timeline.day.empty")}
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      <StateStrip
                        segments={daySegments}
                        dayStart={dayStartMs}
                        label={stateLabel}
                        nowPct={nowPct}
                        nowLabel={t("timeline.day.now")}
                      />
                      <StateStripLegend
                        states={presentStates}
                        label={stateLabel}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day navigation: a clear banner when viewing a past day, or a "rewind to
          the last active day" nudge when today has no data yet. */}
      <DayNav
        selectedDay={selectedDay}
        today={today}
        isToday={isToday}
        hasDataToday={hasDataToday}
        lastActive={lastActive}
        onSelectDay={setSelectedDay}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="charts">{t("timeline.tabs.charts")}</TabsTrigger>
          <TabsTrigger value="day">{t("timeline.tabs.day")}</TabsTrigger>
          <TabsTrigger value="raw">{t("timeline.tabs.raw")}</TabsTrigger>
          <TabsTrigger value="export">{t("timeline.tabs.export")}</TabsTrigger>
        </TabsList>

        <TabsContent value="charts">
          <ChartsTab
            trend={trend}
            heatmap={heatmap}
            intraday={intraday}
            hourlyStates={hourlyStates}
            stateLabels={stateLabels}
            employeeId={employeeId}
            stateHistory={stateHistory}
          />
        </TabsContent>

        <TabsContent value="day">
          <DayDetailTab
            employeeId={employeeId}
            today={today}
            day={selectedDay}
            onSelectDay={setSelectedDay}
          />
        </TabsContent>

        <TabsContent value="raw">
          <RawTab samples={samples} />
        </TabsContent>

        <TabsContent value="export">
          <ExportTab
            deviceId={deviceId}
            fileLabel={fileLabel}
            startDay={startDay}
            today={today}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
