"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Activity,
  ChevronRight,
  MonitorSmartphone,
  Moon,
  PowerOff,
} from "lucide-react";
import { api } from "@advantis/convex/api";
import { useI18n } from "@/lib/activity/i18n";
import { formatDuration, formatRelativeTime } from "@/lib/activity/fmt";
import { cn } from "@/lib/utils";
import { isWorkingState, type StateName } from "@/lib/activity/activity";
import type { EmployeeState } from "@/lib/activity/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/activity/StatCard";
import { SkeletonCard } from "@/components/activity/Skeleton";
import { QueryState } from "@/components/activity/QueryState";
import { SetupChecklist } from "@/components/activity/SetupChecklist";
import { Stagger, StaggerItem } from "@/components/activity/motion/Stagger";
import { HealthBanner, StateBadge } from "@/components/activity/state/StateBits";

/** The four headline figures for the whole fleet. */
function FleetSummary({
  rows,
}: {
  rows: { online: boolean; active: boolean; finalState: string | null }[];
}) {
  const { t } = useI18n();
  // "Working" follows the fused state (a person on BREAK/ABSENT isn't working,
  // even if their PC is on), falling back to the raw active flag when no fused
  // state exists yet — keeps the count in step with the per-card badges.
  const isWorking = (d: { active: boolean; finalState: string | null }) =>
    isWorkingState(d.finalState as StateName | null, d.active);
  const working = rows.filter((d) => d.online && isWorking(d)).length;
  const idle = rows.filter((d) => d.online && !isWorking(d)).length;
  const offline = rows.filter((d) => !d.online).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={t("overview.working")}
        value={working}
        tone="ok"
        live={working > 0}
        icon={<Activity className="h-4 w-4" />}
      />
      <StatCard
        label={t("overview.idleNow")}
        value={idle}
        tone="warn"
        icon={<Moon className="h-4 w-4" />}
      />
      <StatCard
        label={t("overview.offline")}
        value={offline}
        tone="muted"
        icon={<PowerOff className="h-4 w-4" />}
      />
      <StatCard
        label={t("overview.total")}
        value={rows.length}
        tone="fg"
        icon={<MonitorSmartphone className="h-4 w-4" />}
      />
    </div>
  );
}

export default function OverviewPage() {
  const { t, lang } = useI18n();
  const team = useQuery(api.activity.stats.teamOverview);

  return (
    <div className="space-y-6">
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
        {(rows) => (
          <div className="space-y-6">
            <HealthBanner />
            <FleetSummary rows={rows} />
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((d, index) => {
                const offline = !d.online;
                const basic = offline
                  ? "offline"
                  : d.active
                    ? "working"
                    : "idle";
                const basicVariant =
                  basic === "working"
                    ? "success"
                    : basic === "idle"
                      ? "warning"
                      : "muted";
                const basicLabel =
                  basic === "working"
                    ? t("overview.working")
                    : basic === "idle"
                      ? t("overview.idleNow")
                      : t("overview.offline");
                const showFused = !offline && d.finalState != null;
                return (
                  <StaggerItem key={d.deviceId} index={index}>
                    <Link
                      href={`/admin/activity/timeline/${encodeURIComponent(d.deviceId)}`}
                      className="group block h-full"
                    >
                      <Card className="relative h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-signal/40 group-hover:shadow-card-hover">
                        {/* signal line that ignites along the top edge on hover */}
                        <span className="signal-line pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-fg">
                              {d.personName ?? d.hostname}
                            </span>
                            {showFused ? (
                              <StateBadge
                                state={d.finalState as EmployeeState}
                              />
                            ) : (
                              <Badge
                                variant={basicVariant}
                                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider"
                              >
                                {basic === "working" && (
                                  <span className="signal-dot !h-1.5 !w-1.5" />
                                )}
                                {basicLabel}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {d.personName
                              ? d.hostname
                              : t("overview.unassigned")}{" "}
                            · {d.windowsUser}
                          </p>
                          <p className="mt-5 text-3xl font-semibold tabular-nums tracking-tight text-fg">
                            {formatDuration(d.todayActiveSeconds, lang)}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {t("overview.todayActive")}
                            </span>
                          </p>
                          <div className="mt-3 flex items-center justify-between border-t border-border-soft pt-3">
                            <p className="text-[11px] text-muted-foreground">
                              {t("overview.lastSeen")}{" "}
                              <span className="font-medium text-fg/80">
                                {formatRelativeTime(d.lastSeen, lang)}
                              </span>
                            </p>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform duration-150",
                                "group-hover:translate-x-0.5 group-hover:text-signal",
                              )}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        )}
      </QueryState>
    </div>
  );
}
