"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Clock, Coffee, Radio } from "lucide-react";
import { api } from "@advantis/convex/api";
import type { EmployeeState } from "@/lib/activity/format";
import { useI18n } from "@/lib/activity/i18n";
import { useTabParam } from "@/lib/activity/useTabParam";
import {
  formatDuration,
  formatRelativeTime,
  nowMs,
  todayLocalDay,
} from "@/lib/activity/fmt";
import { useDayParam } from "@/lib/activity/useDayParam";
import {
  dailyTrend,
  hourlyStateBreakdown,
  lastActiveDay,
  timelineCharts,
  STATE_NAMES,
  type Sample,
  type StateName,
} from "@/lib/activity/activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/activity/StatCard";
import {
  StateBadge,
  SourceSignals,
} from "@/components/activity/state/StateBits";
import { DayNav } from "@/components/activity/timeline/DayNav";
import { ChartsTab } from "@/components/activity/timeline/ChartsTab";
import { RawTab } from "@/components/activity/timeline/RawTab";
import { ExportTab } from "@/components/activity/timeline/ExportTab";
import { DayDetailTab } from "@/components/activity/timeline/DayDetailTab";

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
  const { trend, heatmap, intraday, hourlyStates, lastActive } = useMemo(() => {
    const tzOffset = new Date().getTimezoneOffset();
    const s: Sample[] = samples ?? [];
    const { heatmap, intraday } = timelineCharts(s, selectedDay, tzOffset);
    return {
      trend: dailyTrend(daily ?? [], startDay, today),
      heatmap,
      intraday,
      lastActive: lastActiveDay(s, tzOffset),
      hourlyStates: hourlyStateBreakdown(
        // For *today* strip the prepended prior-day row (it would credit
        // yesterday's state to hours 00-NN before work started). For a past day
        // we keep it so the strip fills from that day's midnight.
        (stateHistory ?? []).filter(x => !isToday || x.at >= dayStartMs),
        dayStartMs,
        isToday ? nowMs() : dayEndMs,
        tzOffset
      ),
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
  // Short label for the selected day, e.g. "26.06." / "06/26" — used on the
  // per-day KPI labels when the user has rewound to a past day.
  const shortDate = new Date(`${selectedDay}T00:00:00`).toLocaleDateString(
    lang,
    { day: "2-digit", month: "2-digit" }
  );
  // Whether the selected day has anything to show (raw samples or a daily row).
  const hasDataToday = intraday.length > 0 || dayStats != null;

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

      {/* KPI row — active/idle follow the selected day; status/last-seen are
          the device's live state regardless of which day is being viewed. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label={
            isToday
              ? t("timeline.kpi.activeToday")
              : t("timeline.kpi.activeOn", { date: shortDate })
          }
          tone="ok"
          value={formatDuration(dayStats?.activeSeconds ?? 0, lang)}
        />
        <StatCard
          icon={<Coffee className="h-4 w-4" />}
          label={
            isToday
              ? t("timeline.kpi.idleToday")
              : t("timeline.kpi.idleOn", { date: shortDate })
          }
          tone="warn"
          value={formatDuration(dayStats?.idleSeconds ?? 0, lang)}
        />
        <StatCard
          icon={<Radio className="h-4 w-4" />}
          label={t("timeline.kpi.status")}
          value={
            <Badge variant={device?.online ? "success" : "muted"}>
              {device?.online ? t("timeline.online") : t("timeline.offline")}
            </Badge>
          }
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label={t("timeline.kpi.lastSeen")}
          value={device ? formatRelativeTime(device.lastSeen, lang) : "—"}
          valueClassName="text-xl"
        />
      </div>

      {/* Current fused state (workstation + Genesys + Clockodo) */}
      {employeeId && (
        <Card className="animate-fade-up">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              {t("timeline.state.heading")}
            </CardTitle>
            {liveState && <StateBadge state={liveState.finalState} />}
          </CardHeader>
          <CardContent className="pt-0 sm:pt-0">
            {liveState === undefined ? (
              <Skeleton className="h-20 w-full" />
            ) : liveState === null ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("timeline.state.empty")}
              </p>
            ) : (
              <>
                {liveState.deviceIdle && liveState.idleSeconds != null && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    {t("state.idleFor", {
                      duration: formatDuration(liveState.idleSeconds, lang),
                    })}
                  </p>
                )}
                <SourceSignals
                  deviceIdle={liveState.deviceIdle ?? null}
                  genesysRoutingStatus={liveState.genesysRoutingStatus ?? null}
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
