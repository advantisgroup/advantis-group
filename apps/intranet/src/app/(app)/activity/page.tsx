"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowUpCircle,
  ChevronRight,
  Clock,
  Coffee,
  MonitorSmartphone,
  Moon,
  PowerOff,
  Search,
} from "lucide-react";

import { StateStrip, StateStripLegend } from "@/components/activity/charts/StateStrip";
import { InfoTip } from "@/components/activity/InfoTip";
import { Stagger, StaggerItem } from "@/components/activity/motion/Stagger";
import { QueryState } from "@/components/activity/QueryState";
import { SetupChecklist } from "@/components/activity/SetupChecklist";
import { SkeletonCard } from "@/components/activity/Skeleton";
import { StatCard } from "@/components/activity/StatCard";
import { HealthBanner } from "@/components/activity/state/StateBits";
import { StatusSummary } from "@/components/activity/state/StatusSummary";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dayStateSegments, STATE_NAMES, type StateSegment } from "@/lib/activity/activity";
import { formatDuration, formatRelativeTime, todayLocalDay } from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { formatCountdown, nextPollAt } from "@/lib/activity/pollSchedule";
import { describeStatus, type StatusInput } from "@/lib/activity/status";
import { useNow } from "@/lib/activity/useNow";
import { useQueryParam } from "@/lib/activity/useQueryParam";
import { useSlashFocus } from "@/lib/activity/useSlashFocus";
import { isOlderVersion } from "@/lib/activity/version";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

const DAY_MS = 86_400_000;

type TeamRow = FunctionReturnType<typeof api.activity.stats.teamOverview>[number];

/** The raw signals of one row, in the shape `describeStatus` expects. */
function statusOf(d: TeamRow): StatusInput {
  return {
    online: d.online,
    deviceIdle: d.deviceIdle,
    idleSeconds: d.stateIdleSeconds ?? (d.idleMs != null ? Math.round(d.idleMs / 1000) : null),
    genesysRoutingStatus: d.genesysRoutingStatus,
    genesysWrapUp: d.genesysWrapUp,
    clockodoWorking: d.clockodoWorking,
    clockodoBreak: d.clockodoBreak,
    clockodoAbsent: d.clockodoAbsent,
    clockodoClockedOut: d.clockodoClockedOut,
    clockodoClockedOutCertain: d.clockodoClockedOutCertain,
    active: d.active,
  };
}

/**
 * Triage bucket for one row — the grouping the whole dashboard sorts and
 * filters by. "attention" (someone who should be working but has gone quiet)
 * outranks everything so it's always top-left.
 */
type Bucket = "attention" | "working" | "away" | "offline";
const BUCKET_ORDER: Bucket[] = ["attention", "working", "away", "offline"];

type FilterValue = Bucket | "all";
/** URL-param validator for `?filter=` (stable, so `useQueryParam` can dep on it). */
function isFilterValue(v: string): v is FilterValue {
  return v === "all" || (BUCKET_ORDER as string[]).includes(v);
}

function bucketOf(d: TeamRow): Bucket {
  if (d.clockodoAbsent || d.clockodoBreak || d.clockodoClockedOut) return "away";
  if (!d.online) return "offline";
  const { tone } = describeStatus(statusOf(d));
  if (tone === "warn") return "attention";
  if (tone === "muted") return "away";
  return "working";
}

/** Tally every row into its bucket — the one place this count is computed, so
 * the stat tiles, the filter chips and the grid groups below can never
 * disagree with each other about how many people are in a given bucket. */
function countByBucket(rows: TeamRow[]): Record<Bucket, number> {
  const c: Record<Bucket, number> = {
    attention: 0,
    working: 0,
    away: 0,
    offline: 0,
  };
  for (const d of rows) c[bucketOf(d)]++;
  return c;
}

const BUCKET_TONE: Record<Bucket, "ok" | "warn" | "muted"> = {
  working: "ok",
  attention: "warn",
  away: "muted",
  offline: "muted",
};

/**
 * The fleet headline figures, one tile per bucket plus a total — clicking a
 * tile applies that bucket's filter (toggling back to "all" if it's already
 * active), so "who is that?" is always one click away instead of a number
 * with no way to trace it back to a card.
 */
function FleetSummary({
  rows,
  counts,
  filter,
  onFilterChange,
}: {
  rows: TeamRow[];
  counts: Record<Bucket, number>;
  filter: FilterValue;
  onFilterChange: (v: FilterValue) => void;
}) {
  const { t } = useI18n();
  const total = rows.length;
  const onlineCount = rows.filter((d) => d.online).length;

  const bucketIcon: Record<Bucket, ReactNode> = {
    working: <Activity className="h-4 w-4" />,
    attention: <Moon className="h-4 w-4" />,
    away: <Coffee className="h-4 w-4" />,
    offline: <PowerOff className="h-4 w-4" />,
  };

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {BUCKET_ORDER.map((bucket) => {
        const active = filter === bucket;
        return (
          <button
            key={bucket}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(active ? "all" : bucket)}
            className="block w-full appearance-none rounded-2xl border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
          >
            <StatCard
              label={t(`overview.filter.${bucket}`)}
              value={counts[bucket]}
              tone={BUCKET_TONE[bucket]}
              live={bucket === "working" && counts[bucket] > 0}
              progress={total > 0 ? counts[bucket] / total : 0}
              icon={bucketIcon[bucket]}
              className={cn(active && "ring-2 ring-signal/60")}
            />
          </button>
        );
      })}
      {/* Odd tile out on the 2-col mobile grid — span the full row instead of
          leaving an empty cell next to it. */}
      <button
        type="button"
        aria-pressed={filter === "all"}
        onClick={() => onFilterChange("all")}
        className="col-span-2 block w-full appearance-none rounded-2xl border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 lg:col-span-1"
      >
        <StatCard
          label={t("overview.total")}
          value={total}
          tone="fg"
          hint={total > 0 ? `${onlineCount} ${t("overview.online")}` : undefined}
          icon={<MonitorSmartphone className="h-4 w-4" />}
          className={cn(filter === "all" && "ring-2 ring-signal/60")}
        />
      </button>
    </div>
  );
}

/** Filter chips: All · Inactive · Working · Break/absent · Offline. */
function BucketFilter({
  total,
  counts,
  value,
  onChange,
}: {
  total: number;
  counts: Record<Bucket, number>;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const { t } = useI18n();
  const chips: { id: FilterValue; label: string; count: number }[] = [
    { id: "all", label: t("overview.filter.all"), count: total },
    ...BUCKET_ORDER.map((b) => ({
      id: b,
      label: t(`overview.filter.${b}`),
      count: counts[b],
    })),
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {chips.map((chip) => {
        const active = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-signal/40 bg-signal/10 text-signal"
                : "border-border bg-panel/60 text-muted-foreground hover:border-border hover:text-fg",
            )}
          >
            {chip.label}
            <span className="tabular-nums opacity-70">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One person/device card: the written verdict ("Clocked in but inactive"),
 * since when, and a slim colour-coded strip of their whole day — the
 * at-a-glance answer to "were they active, and when did that change". The
 * exact numbers live in the footer, small, for later validation.
 */
function DeviceCard({
  d,
  segments,
  dayStart,
  nowPct,
  latestAgentVersion,
}: {
  d: TeamRow;
  segments: StateSegment[] | null;
  dayStart: number;
  nowPct: number;
  latestAgentVersion: string | null | undefined;
}) {
  const { t, lang } = useI18n();
  // "Since when": for an offline device the honest answer is its last
  // heartbeat; otherwise the moment the fused state last changed.
  const since = !d.online ? d.lastSeen : d.finalStateSince;
  const outdated =
    !!d.agentVersion && !!latestAgentVersion && isOlderVersion(d.agentVersion, latestAgentVersion);

  return (
    <Link
      href={`/activity/timeline/${encodeURIComponent(d.deviceId)}`}
      className="group block h-full"
    >
      <Card className="relative h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-signal/40 group-hover:shadow-card-hover">
        {/* signal line that ignites along the top edge on hover */}
        <span className="signal-line pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
        <CardContent className="flex h-full flex-col gap-3.5 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="block truncate font-medium text-fg">
                {d.personName ?? d.hostname}
              </span>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {d.personName ? d.hostname : t("overview.unassigned")} · {d.windowsUser}
              </p>
            </div>
            {outdated && (
              <InfoTip
                text={t("overview.outdatedHint", {
                  current: d.agentVersion!,
                  latest: latestAgentVersion,
                })}
                className="shrink-0"
              >
                <span className="flex items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-warn">
                  <ArrowUpCircle className="h-3 w-3" />
                  {t("overview.outdated")}
                </span>
              </InfoTip>
            )}
            <ChevronRight
              className={cn(
                "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
                "group-hover:translate-x-0.5 group-hover:text-signal",
              )}
            />
          </div>

          {/* The written verdict + since when — the lead of the card. */}
          <StatusSummary status={statusOf(d)} since={since} />

          {/* Their day so far, as colour instead of numbers. Only devices
              linked to a person have fused-state history. */}
          {segments !== null && (
            <StateStrip
              compact
              segments={segments}
              dayStart={dayStart}
              label={(s) => t(`empstate.${s}`)}
              nowPct={nowPct}
              nowLabel={t("timeline.day.now")}
            />
          )}

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-soft pt-3 text-[11px] text-muted-foreground">
            <span className="truncate">
              <span className="font-medium tabular-nums text-fg/80">
                {formatDuration(d.todayActiveSeconds, lang)}
              </span>{" "}
              {t("overview.todayActive")}
            </span>
            <span className="shrink-0">
              {t("overview.lastSeen")}{" "}
              <span className="font-medium text-fg/80">{formatRelativeTime(d.lastSeen, lang)}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Small, informational "latest ActivityTrack version" pill — not a warning,
 * just the reference point the per-card "Update available" badges are
 * measured against. Hidden until the hourly GitHub-mirroring cron has
 * populated a value (see convex/activity/agentVersion.ts).
 */
function LatestVersionBadge({ version }: { version: string }) {
  const { t } = useI18n();
  return (
    <InfoTip text={t("overview.latestVersionHint")} side="bottom">
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-panel/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        {t("overview.latestVersion", { version })}
      </span>
    </InfoTip>
  );
}

/**
 * "Next sync in …" — a live countdown to the next scheduled Genesys/Clockodo
 * poll, computed client-side from the same cadence as `crons.ts` (no
 * round-trip needed). Ticks every second in its own isolated subtree — the
 * `useNow(1000)` here is local to this component, so the rest of the page
 * doesn't re-render 60x/minute along with it. Data can also arrive sooner via
 * webhook; the tooltip says so, since this is only the periodic fallback.
 */
function NextSyncBadge() {
  const { t, lang } = useI18n();
  const now = useNow(1000);
  const target = nextPollAt(now);
  return (
    <InfoTip text={t("overview.nextSyncHint")} side="bottom">
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-panel/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <Clock className="h-3 w-3" />
        {t("overview.nextSync", {
          duration: formatCountdown(target - now, lang),
        })}
      </span>
    </InfoTip>
  );
}

export default function OverviewPage() {
  const { t } = useI18n();
  const team = useQuery(api.activity.stats.teamOverview);
  const latestAgentVersion = useQuery(api.activity.agentVersion.getLatestAgentVersion);
  // The active chip lives in `?filter=` so a reload or shared link keeps it.
  const [filter, setFilter] = useQueryParam<FilterValue>("filter", "all", isFilterValue);
  const [search, setSearch] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();
  // 30s tick so "last seen"/"since" labels and the now-marker stay fresh even
  // while Convex has no data change to push.
  const now = useNow();

  // Local midnight for the per-card day strips ("today" in the viewer's tz).
  const today = todayLocalDay();
  const dayStart = useMemo(() => new Date(`${today}T00:00:00`).getTime(), [today]);
  const nowPct = ((now - dayStart) / DAY_MS) * 100;

  // Debug visibility into the version check from the browser console — the
  // cron that populates `latestAgentVersion` runs hourly server-side, so
  // "why isn't the badge showing" is otherwise invisible from the client.
  useEffect(() => {
    if (!team) return;
    console.warn("[ActivityTrack] latestAgentVersion:", latestAgentVersion);
    console.warn(
      "[ActivityTrack] device agentVersions:",
      team.map((d) => ({ hostname: d.hostname, agentVersion: d.agentVersion })),
    );
    if (latestAgentVersion) {
      const outdated = team.filter(
        (d) => d.agentVersion && isOlderVersion(d.agentVersion, latestAgentVersion),
      );
      console.warn(
        "[ActivityTrack] outdated devices:",
        outdated.map((d) => ({
          hostname: d.hostname,
          agentVersion: d.agentVersion,
        })),
      );
    }
  }, [team, latestAgentVersion]);

  // Surface the attention count in the browser tab ("(2) …") so a manager with
  // the dashboard pinned sees trouble without switching tabs.
  const attentionCount = useMemo(
    () => (team ?? []).filter((d) => bucketOf(d) === "attention").length,
    [team],
  );
  useEffect(() => {
    if (attentionCount === 0) return;
    const original = document.title;
    document.title = `(${attentionCount}) ${original}`;
    return () => {
      document.title = original;
    };
  }, [attentionCount]);

  // One batched, reactive subscription for every linked person's day strip
  // (instead of one query per card).
  const employeeIds = useMemo(
    () =>
      [
        ...new Set((team ?? []).flatMap((d) => (d.personEmployeeId ? [d.personEmployeeId] : []))),
      ].sort(),
    [team],
  );
  const strips = useQuery(
    api.activity.state.historyBatch,
    employeeIds.length > 0 ? { employeeIds, since: dayStart } : "skip",
  );
  const segmentsByEmployee = useMemo(() => {
    const map = new Map<string, StateSegment[]>();
    for (const s of strips ?? []) {
      map.set(s.employeeId, dayStateSegments(s.samples, dayStart, now));
    }
    return map;
  }, [strips, dayStart, now]);

  // Which states actually occur today, for the shared strip legend.
  const presentStates = useMemo(
    () =>
      STATE_NAMES.filter((name) =>
        [...segmentsByEmployee.values()].some((segs) => segs.some((seg) => seg.state === name)),
      ),
    [segmentsByEmployee],
  );

  return (
    <div className="space-y-6" data-tour="tour-activity-stats">
      <PageHeader
        title={t("overview.heading")}
        description={t("overview.sub")}
        icon={<Activity />}
        action={
          team !== undefined ? (
            <div className="flex items-center gap-2">
              {latestAgentVersion && <LatestVersionBadge version={latestAgentVersion} />}
              <NextSyncBadge />
              <span
                title={t("overview.liveHint")}
                className="flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-medium text-ok"
              >
                <span aria-hidden className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
                </span>
                {t("overview.live")}
              </span>
            </div>
          ) : undefined
        }
      />
      <SetupChecklist />
      <QueryState
        data={team}
        loading={
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-[7.5rem] animate-pulse rounded-2xl border border-border bg-panel/60",
                    i === 4 && "col-span-2 lg:col-span-1",
                  )}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        }
        empty={
          <Card className="signal-grid">
            <CardContent className="py-16 text-center text-muted-foreground">
              {t("overview.empty")}
            </CardContent>
          </Card>
        }
      >
        {(rows) => {
          // Name order inside a bucket keeps cards from jumping around; the
          // bucket sections below take care of attention-first ordering.
          const sorted = [...rows].sort((a, b) =>
            (a.personName ?? a.hostname).localeCompare(b.personName ?? b.hostname),
          );
          const q = search.trim().toLowerCase();
          const searched = q
            ? sorted.filter((d) =>
                [d.personName, d.hostname, d.windowsUser]
                  .filter(Boolean)
                  .some((s) => String(s).toLowerCase().includes(q)),
              )
            : sorted;
          const visible =
            filter === "all" ? searched : searched.filter((d) => bucketOf(d) === filter);
          // Cards grouped under bucket headings, worst first.
          const groups = BUCKET_ORDER.flatMap((bucket) => {
            const cards = visible.filter((d) => bucketOf(d) === bucket);
            return cards.length > 0 ? [{ bucket, cards }] : [];
          });
          // Single source of truth for "how many people are in each bucket" —
          // the stat tiles, the filter chips and the grid groups above all
          // read from this same tally so their numbers can never disagree.
          const counts = countByBucket(rows);

          return (
            <div className="space-y-6">
              <HealthBanner />
              <FleetSummary
                rows={rows}
                counts={counts}
                filter={filter}
                onFilterChange={setFilter}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <BucketFilter
                  total={rows.length}
                  counts={counts}
                  value={filter}
                  onChange={setFilter}
                />
                <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                  <div className="relative w-full sm:w-auto">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("common.search")}
                      aria-label={t("common.search")}
                      className="h-9 w-full pl-9 sm:w-44"
                    />
                  </div>
                  <StateStripLegend states={presentStates} label={(s) => t(`empstate.${s}`)} />
                </div>
              </div>

              {visible.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    {t("overview.noMatches")}
                  </CardContent>
                </Card>
              ) : (
                groups.map(({ bucket, cards }) => (
                  <section key={bucket} className="space-y-3">
                    <h2 className="kicker flex items-center gap-2">
                      {t(`overview.filter.${bucket}`)}
                      <span className="tabular-nums text-muted-foreground">{cards.length}</span>
                    </h2>
                    <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {cards.map((d, index) => (
                        <StaggerItem key={d.deviceId} index={index}>
                          <DeviceCard
                            d={d}
                            segments={
                              d.personEmployeeId
                                ? (segmentsByEmployee.get(d.personEmployeeId) ?? [])
                                : null
                            }
                            dayStart={dayStart}
                            nowPct={nowPct}
                            latestAgentVersion={latestAgentVersion}
                          />
                        </StaggerItem>
                      ))}
                    </Stagger>
                  </section>
                ))
              )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
