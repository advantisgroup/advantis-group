"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Activity,
  ChevronRight,
  MonitorSmartphone,
  Moon,
  PowerOff,
  Search,
} from "lucide-react";

import {
  StateStrip,
  StateStripLegend,
} from "@/components/activity/charts/StateStrip";
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
import {
  dayStateSegments,
  isWorkingState,
  STATE_NAMES,
  type StateName,
  type StateSegment,
} from "@/lib/activity/activity";
import {
  formatDuration,
  formatRelativeTime,
  todayLocalDay,
} from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { describeStatus, type StatusInput } from "@/lib/activity/status";
import { useNow } from "@/lib/activity/useNow";
import { useQueryParam } from "@/lib/activity/useQueryParam";
import { useSlashFocus } from "@/lib/activity/useSlashFocus";
import { cn } from "@/lib/utils";

import type { FunctionReturnType } from "convex/server";

const DAY_MS = 86_400_000;

type TeamRow = FunctionReturnType<
  typeof api.activity.stats.teamOverview
>[number];

/** The raw signals of one row, in the shape `describeStatus` expects. */
function statusOf(d: TeamRow): StatusInput {
  return {
    online: d.online,
    deviceIdle: d.deviceIdle,
    idleSeconds:
      d.stateIdleSeconds ??
      (d.idleMs != null ? Math.round(d.idleMs / 1000) : null),
    genesysRoutingStatus: d.genesysRoutingStatus,
    genesysWrapUp: d.genesysWrapUp,
    clockodoWorking: d.clockodoWorking,
    clockodoBreak: d.clockodoBreak,
    clockodoAbsent: d.clockodoAbsent,
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
  if (d.clockodoAbsent || d.clockodoBreak) return "away";
  if (!d.online) return "offline";
  const { tone } = describeStatus(statusOf(d));
  if (tone === "warn") return "attention";
  if (tone === "muted") return "away";
  return "working";
}

/** The four headline figures for the whole fleet. */
function FleetSummary({ rows }: { rows: TeamRow[] }) {
  const { t } = useI18n();
  // "Working" follows the fused state (a person on BREAK/ABSENT isn't working,
  // even if their PC is on), falling back to the raw active flag when no fused
  // state exists yet — keeps the count in step with the per-card badges.
  const isWorking = (d: TeamRow) =>
    isWorkingState(d.finalState as StateName | null, d.active);
  const working = rows.filter(d => d.online && isWorking(d)).length;
  const idle = rows.filter(d => d.online && !isWorking(d)).length;
  const offline = rows.filter(d => !d.online).length;
  const total = rows.length;
  const onlineCount = working + idle;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={t("overview.working")}
        value={working}
        tone="ok"
        live={working > 0}
        progress={total > 0 ? working / total : 0}
        icon={<Activity className="h-4 w-4" />}
      />
      <StatCard
        label={t("overview.idleNow")}
        value={idle}
        tone="warn"
        progress={total > 0 ? idle / total : 0}
        icon={<Moon className="h-4 w-4" />}
      />
      <StatCard
        label={t("overview.offline")}
        value={offline}
        tone="muted"
        progress={total > 0 ? offline / total : 0}
        hint={total > 0 ? t("overview.ofTotal", { total }) : undefined}
        icon={<PowerOff className="h-4 w-4" />}
      />
      <StatCard
        label={t("overview.total")}
        value={total}
        tone="fg"
        hint={total > 0 ? `${onlineCount} ${t("overview.online")}` : undefined}
        icon={<MonitorSmartphone className="h-4 w-4" />}
      />
    </div>
  );
}

/** Filter chips: All · Inactive · Working · Break/absent · Offline. */
function BucketFilter({
  rows,
  value,
  onChange,
}: {
  rows: TeamRow[];
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const { t } = useI18n();
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = {
      attention: 0,
      working: 0,
      away: 0,
      offline: 0,
    };
    for (const d of rows) c[bucketOf(d)]++;
    return c;
  }, [rows]);

  const chips: { id: FilterValue; label: string; count: number }[] = [
    { id: "all", label: t("overview.filter.all"), count: rows.length },
    ...BUCKET_ORDER.map(b => ({
      id: b,
      label: t(`overview.filter.${b}`),
      count: counts[b],
    })),
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {chips.map(chip => {
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
                : "border-border bg-panel/60 text-muted-foreground hover:border-border hover:text-fg"
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
}: {
  d: TeamRow;
  segments: StateSegment[] | null;
  dayStart: number;
  nowPct: number;
}) {
  const { t, lang } = useI18n();
  // "Since when": for an offline device the honest answer is its last
  // heartbeat; otherwise the moment the fused state last changed.
  const since = !d.online ? d.lastSeen : d.finalStateSince;

  return (
    <Link
      href={`/admin/activity/timeline/${encodeURIComponent(d.deviceId)}`}
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
                {d.personName ? d.hostname : t("overview.unassigned")} ·{" "}
                {d.windowsUser}
              </p>
            </div>
            <ChevronRight
              className={cn(
                "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
                "group-hover:translate-x-0.5 group-hover:text-signal"
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
              label={s => t(`empstate.${s}`)}
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
              <span className="font-medium text-fg/80">
                {formatRelativeTime(d.lastSeen, lang)}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function OverviewPage() {
  const { t } = useI18n();
  const team = useQuery(api.activity.stats.teamOverview);
  // The active chip lives in `?filter=` so a reload or shared link keeps it.
  const [filter, setFilter] = useQueryParam<FilterValue>(
    "filter",
    "all",
    isFilterValue
  );
  const [search, setSearch] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();
  // 30s tick so "last seen"/"since" labels and the now-marker stay fresh even
  // while Convex has no data change to push.
  const now = useNow();

  // Local midnight for the per-card day strips ("today" in the viewer's tz).
  const today = todayLocalDay();
  const dayStart = useMemo(
    () => new Date(`${today}T00:00:00`).getTime(),
    [today]
  );
  const nowPct = ((now - dayStart) / DAY_MS) * 100;

  // Surface the attention count in the browser tab ("(2) …") so a manager with
  // the dashboard pinned sees trouble without switching tabs.
  const attentionCount = useMemo(
    () => (team ?? []).filter(d => bucketOf(d) === "attention").length,
    [team]
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
        ...new Set(
          (team ?? []).flatMap(d =>
            d.personEmployeeId ? [d.personEmployeeId] : []
          )
        ),
      ].sort(),
    [team]
  );
  const strips = useQuery(
    api.activity.state.historyBatch,
    employeeIds.length > 0 ? { employeeIds, since: dayStart } : "skip"
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
      STATE_NAMES.filter(name =>
        [...segmentsByEmployee.values()].some(segs =>
          segs.some(seg => seg.state === name)
        )
      ),
    [segmentsByEmployee]
  );

  return (
    <div className="space-y-6" data-tour="tour-activity-stats">
      <PageHeader
        title={t("overview.heading")}
        description={t("overview.sub")}
        icon={<Activity />}
        action={
          team !== undefined ? (
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
          ) : undefined
        }
      />
      <SetupChecklist />
      <QueryState
        data={team}
        loading={
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[7.5rem] animate-pulse rounded-2xl border border-border bg-panel/60"
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
        {rows => {
          // Name order inside a bucket keeps cards from jumping around; the
          // bucket sections below take care of attention-first ordering.
          const sorted = [...rows].sort((a, b) =>
            (a.personName ?? a.hostname).localeCompare(
              b.personName ?? b.hostname
            )
          );
          const q = search.trim().toLowerCase();
          const searched = q
            ? sorted.filter(d =>
                [d.personName, d.hostname, d.windowsUser]
                  .filter(Boolean)
                  .some(s => String(s).toLowerCase().includes(q))
              )
            : sorted;
          const visible =
            filter === "all"
              ? searched
              : searched.filter(d => bucketOf(d) === filter);
          // Cards grouped under bucket headings, worst first.
          const groups = BUCKET_ORDER.flatMap(bucket => {
            const cards = visible.filter(d => bucketOf(d) === bucket);
            return cards.length > 0 ? [{ bucket, cards }] : [];
          });

          return (
            <div className="space-y-6">
              <HealthBanner />
              <FleetSummary rows={rows} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <BucketFilter rows={rows} value={filter} onChange={setFilter} />
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={t("common.search")}
                      aria-label={t("common.search")}
                      className="h-9 w-44 pl-9"
                    />
                  </div>
                  <StateStripLegend
                    states={presentStates}
                    label={s => t(`empstate.${s}`)}
                  />
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
                      <span className="tabular-nums text-muted-foreground">
                        {cards.length}
                      </span>
                    </h2>
                    <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {cards.map((d, index) => (
                        <StaggerItem key={d.deviceId} index={index}>
                          <DeviceCard
                            d={d}
                            segments={
                              d.personEmployeeId
                                ? (segmentsByEmployee.get(d.personEmployeeId) ??
                                  [])
                                : null
                            }
                            dayStart={dayStart}
                            nowPct={nowPct}
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
