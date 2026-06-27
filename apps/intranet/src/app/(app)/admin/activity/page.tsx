"use client";

import { useQuery } from "convex/react";
import { Activity, Clock, Monitor, Users } from "lucide-react";

import { api } from "@advantis/convex/api";
import { useLocale, useTranslations } from "next-intl";

import { StatCard } from "@/components/activity/StatCard";
import { StateBadge } from "@/components/activity/StateBadge";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/activity/format";
import { relativeTime } from "@/lib/format";

export default function ActivityOverviewPage() {
  const t = useTranslations("Activity");
  const locale = useLocale();
  const rows = useQuery(api.activity.stats.teamOverview, {});

  const loading = rows === undefined;
  const online = rows?.filter(r => r.online).length ?? 0;
  const active = rows?.filter(r => r.active).length ?? 0;
  const totalActiveSeconds =
    rows?.reduce((sum, r) => sum + (r.todayActiveSeconds ?? 0), 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={t("title")}
        title={t("overview.title")}
        icon={<Activity />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("nav.devices")}
          value={loading ? "—" : (rows?.length ?? 0)}
          icon={<Monitor />}
        />
        <StatCard
          label={t("states.online")}
          value={loading ? "—" : online}
          icon={<Users />}
        />
        <StatCard
          label={t("states.ACTIVE")}
          value={loading ? "—" : active}
          icon={<Activity />}
        />
        <StatCard
          label={t("overview.activeToday")}
          value={loading ? "—" : formatDuration(totalActiveSeconds)}
          icon={<Clock />}
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {t("overview.empty")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(r => (
            <Card key={r.deviceId}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {r.personName ?? t("overview.noPerson")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.hostname} · {r.windowsUser}
                    </p>
                  </div>
                  <StateBadge state={r.finalState} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <Badge variant={r.online ? "success" : "muted"}>
                    {r.online ? t("states.online") : t("states.offline")}
                  </Badge>
                  <span className="text-muted-foreground">
                    {t("overview.activeToday")}:{" "}
                    <span className="font-medium text-foreground">
                      {formatDuration(r.todayActiveSeconds)}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t("overview.lastSeen")}: {relativeTime(r.lastSeen)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
