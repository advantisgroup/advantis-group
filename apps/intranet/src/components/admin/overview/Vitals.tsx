"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Inbox, Plug, Users, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";

import { StatTile } from "./primitives";

/**
 * The four numbers the overview leads with: how many people, how much is
 * waiting, who is around, and is anything on fire. Each tile carries the
 * headline plus one line of context, so the row answers "what's the state of
 * the org" without scrolling.
 *
 * No hero figure here on purpose — four peers, none of them the story every
 * day. The delta chips carry the movement.
 */
export function Vitals({ tzOffsetMinutes }: { tzOffsetMinutes: number }) {
  const t = useTranslations("Admin");
  const pulse = useQuery(api.adminOverview.pulse, { tzOffsetMinutes });
  const queue = useQuery(api.adminOverview.queue);
  const systems = useQuery(api.adminOverview.systems);

  if (!pulse || !queue || !systems) {
    return (
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[124px] rounded-xl" />
        ))}
      </div>
    );
  }

  const joinDelta =
    pulse.joinedPreviousWindow === 0
      ? null
      : ((pulse.joinedWindow - pulse.joinedPreviousWindow) / pulse.joinedPreviousWindow) * 100;

  const degraded = systems.integrations.filter((i) => i.status === "unavailable").length;
  const incidents = systems.liveUpdates.length;
  const systemsTone = degraded > 0 || incidents > 0 ? "warn" : "ok";

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <StatTile
        icon={Users}
        label={t("overview.vitals.headcount")}
        value={pulse.headcount.active}
        delta={joinDelta}
        deltaGoodWhen="neutral"
        headline={t("overview.vitals.joined", { count: pulse.joinedWindow })}
        context={t("overview.vitals.headcountContext", {
          managers: pulse.headcount.admins + pulse.headcount.managers,
          external: pulse.headcount.external,
        })}
        href="/admin/members"
      />
      <StatTile
        icon={Inbox}
        label={t("overview.vitals.queue")}
        value={queue.total}
        tone={queue.overdue > 0 ? "warn" : "neutral"}
        headline={
          queue.overdue > 0
            ? t("overview.vitals.queueOverdue", { count: queue.overdue })
            : t("overview.vitals.queueClear")
        }
        context={t("overview.vitals.queueContext", { areas: queue.items.length })}
      />
      <StatTile
        icon={Wifi}
        label={t("overview.vitals.online")}
        value={pulse.onlineNow}
        headline={t("overview.vitals.seenToday", { count: pulse.seenToday })}
        context={t("overview.vitals.onlineContext", { total: pulse.headcount.active })}
        href="/directory"
      />
      <StatTile
        icon={Plug}
        label={t("overview.vitals.systems")}
        value={`${systems.integrations.length - degraded}/${systems.integrations.length}`}
        tone={systemsTone}
        headline={
          incidents > 0
            ? t("overview.vitals.incidents", { count: incidents })
            : t("overview.vitals.systemsOk")
        }
        context={
          systems.disabledFlags.length > 0
            ? t("overview.vitals.flagsOff", { count: systems.disabledFlags.length })
            : t("overview.vitals.flagsAllOn")
        }
        href="/admin/integrations"
      />
    </div>
  );
}
