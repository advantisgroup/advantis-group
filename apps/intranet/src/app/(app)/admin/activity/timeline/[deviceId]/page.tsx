"use client";

import { use, useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MonitorSmartphone,
} from "lucide-react";

import { StateStripLegend } from "@/components/activity/charts/StateStrip";
import { StateTimelineChart } from "@/components/activity/charts/StateTimelineChart";
import { STATE_COLOR } from "@/components/activity/charts/theme";
import { InfoTip } from "@/components/activity/InfoTip";
import { SourceSignals } from "@/components/activity/state/StateBits";
import { StatusSummary } from "@/components/activity/state/StatusSummary";
import { ChartsTab } from "@/components/activity/timeline/ChartsTab";
import { DayDetailTab } from "@/components/activity/timeline/DayDetailTab";
import { DayNav } from "@/components/activity/timeline/DayNav";
import { DiscardedTab } from "@/components/activity/timeline/DiscardedTab";
import { ExportTab } from "@/components/activity/timeline/ExportTab";
import { RawTab } from "@/components/activity/timeline/RawTab";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  todayLocalDay,
} from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { useDayParam } from "@/lib/activity/useDayParam";
import { useNow } from "@/lib/activity/useNow";
import { useTabParam } from "@/lib/activity/useTabParam";
import { cn } from "@/lib/utils";

const TREND_DAYS = 14;
/** How many of the day's most recent state changes the "right now" card lists. */
const RECENT_CHANGES = 6;

function hhmm(ms: number, lang: string): string {
  return new Date(ms).toLocaleTimeString(lang, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimelinePage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId: rawDeviceId } = use(params);
  const { t, lang } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useTabParam("charts");
  const deviceId = decodeURIComponent(rawDeviceId);
  const [showAllChanges, setShowAllChanges] = useState(false);
  // Clicking a "state changes" list entry highlights the matching segment on
  // the timeline above — clicking it again clears the highlight.
  const [highlightedChangeAt, setHighlightedChangeAt] = useState<number | null>(
    null
  );
  // 30s tick so "last seen"/"since" labels and the now-marker stay fresh even
  // while Convex has no data change to push.
  const now = useNow();

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

  // Prev/next person switcher: the whole team in stable name order, so a
  // manager can walk through everyone without returning to the overview.
  const switcher = useMemo(() => {
    if (!team || team.length < 2) return null;
    const ordered = [...team].sort((a, b) =>
      (a.personName ?? a.hostname).localeCompare(b.personName ?? b.hostname)
    );
    const index = ordered.findIndex(d => d.deviceId === deviceId);
    return index === -1 ? null : { ordered, index };
  }, [team, deviceId]);
  // Keeps ?day/?tab so switching people compares the same view.
  const openPerson = (id: string) => {
    router.push(
      `/admin/activity/timeline/${encodeURIComponent(id)}${window.location.search}`
    );
  };

  // ← / → step through days (unless focus is in a field, tab list, menu…).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target;
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el.closest(
            "input, textarea, select, button, a, [role='tab'], [role='listbox'], [role='menu'], [role='dialog']"
          ))
      ) {
        return;
      }
      const d = new Date(`${selectedDay}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + (e.key === "ArrowLeft" ? -1 : 1));
      const next = d.toISOString().slice(0, 10);
      if (next > today) return;
      e.preventDefault();
      setSelectedDay(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDay, setSelectedDay, today]);

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
  const {
    trend,
    heatmap,
    intraday,
    hourlyStates,
    daySegments,
    stateChanges,
    lastActive,
  } = useMemo(() => {
    const tzOffset = new Date().getTimezoneOffset();
    const s: Sample[] = samples ?? [];
    const { heatmap, intraday } = timelineCharts(s, selectedDay, tzOffset);
    // For *today* strip the prepended prior-day row (it would credit
    // yesterday's state to hours 00-NN before work started). For a past day
    // we keep it so the strip fills from that day's midnight.
    const dayHistory = (stateHistory ?? []).filter(
      x => !isToday || x.at >= dayStartMs
    );
    const windowEnd = isToday ? now : dayEndMs;
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
      // Newest first — the "what changed, when" feed in plain words. The
      // render caps it at RECENT_CHANGES until the user expands it.
      stateChanges: dayHistory.filter(x => x.at >= dayStartMs).reverse(),
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
    now,
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

  // Day totals — kept, but as supporting figures for validation/export rather
  // than the lead of the card.
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
  const nowPct = isToday ? ((now - dayStartMs) / 86_400_000) * 100 : null;
  const stateLabel = (s: StateName) => t(`empstate.${s}`);
  // "Since when" for the hero verdict: last heartbeat when offline, otherwise
  // the moment the fused state last changed.
  const since = device
    ? !device.online
      ? device.lastSeen
      : device.finalStateSince
    : null;

  return (
    <section className="space-y-6">
      <Link
        href="/admin/activity"
        className="group inline-flex items-center gap-1 text-sm text-signal"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        {t("timeline.back")}
      </Link>

      <PageHeader
        title={title}
        description={
          device
            ? `${device.hostname} · ${device.windowsUser} · ${deviceId}`
            : deviceId
        }
        icon={<MonitorSmartphone />}
        action={
          switcher ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("timeline.prevPerson")}
                disabled={switcher.index === 0}
                onClick={() => {
                  const prev = switcher.ordered[switcher.index - 1];
                  if (prev) openPerson(prev.deviceId);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {switcher.index + 1} / {switcher.ordered.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("timeline.nextPerson")}
                disabled={switcher.index === switcher.ordered.length - 1}
                onClick={() => {
                  const next = switcher.ordered[switcher.index + 1];
                  if (next) openPerson(next.deviceId);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* "Right now" — the verdict in plain words with since-when, the day as a
          colour strip, the latest state changes as a feed, and the per-source
          breakdown. The exact numbers sit below the strip, small, for later
          validation and export. */}
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
                  since={since}
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
                    clockodoClockedOut: device.clockodoClockedOut,
                    clockodoClockedOutCertain: device.clockodoClockedOutCertain,
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
                          clockodoClockedOut={
                            liveState.clockodoClockedOut ?? null
                          }
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

              {/* RIGHT — the day as colour, the latest changes as words, and
                  the exact totals demoted to a small validation line. */}
              <div className="space-y-4 lg:border-l lg:border-border-soft lg:pl-5">
                <div>
                  <p className="kicker mb-2">
                    {t("timeline.now.dayTimeline")}
                    {!isToday && ` · ${shortDate}`}
                  </p>
                  {!employeeId ? (
                    <p className="text-sm text-muted-foreground">
                      {t("timeline.hourly.unlinked")}{" "}
                      <Link
                        href="/admin/activity/people"
                        className="whitespace-nowrap text-signal hover:underline"
                      >
                        {t("timeline.unlinkedCta")}
                      </Link>
                    </p>
                  ) : stateHistory === undefined ? (
                    <Skeleton className="h-12 w-full" />
                  ) : daySegments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("timeline.day.empty")}
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      <StateTimelineChart
                        segments={daySegments}
                        dayStart={dayStartMs}
                        label={stateLabel}
                        nowPct={nowPct}
                        nowLabel={t("timeline.day.now")}
                        highlightAt={highlightedChangeAt}
                      />
                      <StateStripLegend
                        states={presentStates}
                        label={stateLabel}
                      />
                    </div>
                  )}
                </div>

                {/* The latest state changes, newest first — "what changed,
                    when" in plain words instead of a chart. */}
                {employeeId && stateHistory !== undefined && (
                  <div>
                    <p className="kicker mb-2">
                      {t("timeline.now.recent")}
                      {!isToday && ` · ${shortDate}`}
                    </p>
                    {stateChanges.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("timeline.now.recentEmpty")}
                      </p>
                    ) : (
                      <>
                        <ul
                          className={cn(
                            "space-y-1.5",
                            showAllChanges && "max-h-64 overflow-y-auto pr-1"
                          )}
                        >
                          {(showAllChanges
                            ? stateChanges
                            : stateChanges.slice(0, RECENT_CHANGES)
                          ).map(r => (
                            <li key={r.at}>
                              <button
                                type="button"
                                onClick={() =>
                                  setHighlightedChangeAt(at =>
                                    at === r.at ? null : r.at
                                  )
                                }
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-md px-1.5 py-0.5 text-sm transition-colors hover:bg-panel-2",
                                  highlightedChangeAt === r.at && "bg-panel-2"
                                )}
                              >
                                <span
                                  aria-hidden
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ background: STATE_COLOR[r.state] }}
                                />
                                <span className="min-w-0 truncate font-medium text-fg">
                                  {stateLabel(r.state)}
                                </span>
                                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                                  {hhmm(r.at, lang)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {stateChanges.length > RECENT_CHANGES && (
                          <button
                            type="button"
                            onClick={() => setShowAllChanges(v => !v)}
                            className="mt-2 text-xs font-medium text-signal hover:underline"
                          >
                            {showAllChanges
                              ? t("timeline.now.showFewer")
                              : t("timeline.now.showAll", {
                                  count: stateChanges.length,
                                })}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Exact figures — deliberately small: they're for validating
                    and exporting, not for the first glance. */}
                <div className="border-t border-border-soft pt-3">
                  <p className="kicker mb-1">{t("timeline.now.numbers")}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold tabular-nums text-ok">
                      {formatDuration(activeSeconds, lang)}
                    </span>{" "}
                    {t("common.active").toLowerCase()}
                    {" · "}
                    <span className="font-semibold tabular-nums text-warn">
                      {formatDuration(idleSeconds, lang)}
                    </span>{" "}
                    {t("common.idle").toLowerCase()}
                    {activeShare != null && (
                      <>
                        {" · "}
                        <span className="font-semibold tabular-nums text-fg">
                          {activeShare}%
                        </span>{" "}
                        {t("timeline.now.activeShare").toLowerCase()}
                      </>
                    )}
                  </p>
                  {/* Active-vs-idle as a bar, quicker to read than the %. */}
                  {trackedSeconds > 0 && (
                    <div
                      aria-hidden
                      className="mt-2 flex h-1.5 max-w-xs overflow-hidden rounded-full"
                    >
                      <span
                        className="h-full bg-ok"
                        style={{
                          width: `${(activeSeconds / trackedSeconds) * 100}%`,
                        }}
                      />
                      <span className="h-full flex-1 bg-warn/50" />
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t("timeline.now.numbersHint")}
                  </p>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="charts">
              {t("timeline.tabs.charts")}
            </TabsTrigger>
            <TabsTrigger value="day">{t("timeline.tabs.day")}</TabsTrigger>
            <TabsTrigger value="raw">{t("timeline.tabs.raw")}</TabsTrigger>
            <TabsTrigger value="export">
              {t("timeline.tabs.export")}
            </TabsTrigger>
            {/* Deliberately not a permanent tab — quarantined data is an
                audit surface reached via the "Missing data?" hint or
                Settings → Discarded data. Shown only while open. */}
            {tab === "discarded" && (
              <TabsTrigger value="discarded">
                {t("timeline.tabs.discarded")}
              </TabsTrigger>
            )}
          </TabsList>
          {tab !== "discarded" && (
            <InfoTip text={t("timeline.discarded.hint")} side="left">
              <button
                type="button"
                onClick={() => setTab("discarded")}
                className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-fg"
              >
                {t("timeline.discarded.missing")}
              </button>
            </InfoTip>
          )}
        </div>

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

        <TabsContent value="discarded">
          <DiscardedTab
            employeeId={employeeId}
            day={selectedDay}
            today={today}
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
