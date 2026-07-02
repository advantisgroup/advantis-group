"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Activity,
  ChevronRight,
  MonitorSmartphone,
  Moon,
  PowerOff,
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
  nowMs,
  todayLocalDay,
} from "@/lib/activity/fmt";
import { useI18n } from "@/lib/activity/i18n";
import { describeStatus, type StatusInput } from "@/lib/activity/status";
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
      d.stateIdleSeconds ?? (d.idleMs != null ? Math.round(d.idleMs / 1000) : null),
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
  value: Bucket | "all";
  onChange: (v: Bucket | "all") => void;
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

  const chips: { id: Bucket | "all"; label: string; count: number }[] = [
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
  const [filter, setFilter] = useState<Bucket | "all">("all");

  // Local midnight for the per-card day strips ("today" in the viewer's tz).
  const today = todayLocalDay();
  const dayStart = useMemo(
    () => new Date(`${today}T00:00:00`).getTime(),
    [today]
  );
  const nowPct = ((nowMs() - dayStart) / DAY_MS) * 100;

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
    const end = nowMs();
    for (const s of strips ?? []) {
      map.set(s.employeeId, dayStateSegments(s.samples, dayStart, end));
    }
    return map;
  }, [strips, dayStart]);

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
          // Attention first, then working, away, offline — inside a bucket the
          // order stays stable (by name) so cards don't jump around.
          const sorted = [...rows].sort((a, b) => {
            const rank =
              BUCKET_ORDER.indexOf(bucketOf(a)) -
              BUCKET_ORDER.indexOf(bucketOf(b));
            if (rank !== 0) return rank;
            return (a.personName ?? a.hostname).localeCompare(
              b.personName ?? b.hostname
            );
          });
          const visible =
            filter === "all"
              ? sorted
              : sorted.filter(d => bucketOf(d) === filter);

          return (
            <div className="space-y-6">
              <HealthBanner />
              <FleetSummary rows={rows} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <BucketFilter rows={rows} value={filter} onChange={setFilter} />
                <StateStripLegend
                  states={presentStates}
                  label={s => t(`empstate.${s}`)}
                />
              </div>

              {visible.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    {t("overview.noMatches")}
                  </CardContent>
                </Card>
              ) : (
                <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((d, index) => (
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
                      />
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
