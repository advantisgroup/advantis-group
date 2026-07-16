"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Clock, KeyRound, Mail, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * A compact stat strip for the admin landing. The old full KPI cards ate a
 * whole screen of vertical space on mobile and pushed the actual member list
 * below the fold, so this trades them for small inline pills that wrap.
 */
export function AdminOverview({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const members = useQuery(api.users.list, { includeSuspended: true });
  const requests = useQuery(api.accessRequests.list, { status: "pending" });
  const invites = useQuery(api.invites.list, { status: "pending" });
  const guests = useQuery(api.guest.listTempLogins, isAdmin ? {} : "skip");

  const dash = (n: number | undefined) => (n === undefined ? "—" : n);
  const activeMembers = members?.filter(m => m.status === "active").length;
  const reqCount = requests?.length;
  const invCount = invites?.length;
  const guestCount = guests?.filter(g => g.status === "active").length;

  const stats: {
    label: string;
    value: number | string;
    icon: typeof Users;
    accent: boolean;
  }[] = [
    {
      label: t("overviewMembers"),
      value: dash(activeMembers),
      icon: Users,
      accent: false,
    },
    {
      label: t("overviewRequests"),
      value: dash(reqCount),
      icon: Clock,
      accent: !!reqCount,
    },
    {
      label: t("overviewInvites"),
      value: dash(invCount),
      icon: Mail,
      accent: !!invCount,
    },
  ];
  if (isAdmin)
    stats.push({
      label: t("overviewGuests"),
      value: dash(guestCount),
      icon: KeyRound,
      accent: !!guestCount,
    });

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {stats.map(s => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card px-3 py-2 sm:flex-1 sm:basis-40"
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md ring-1 ring-inset",
                s.accent
                  ? "bg-signal/12 text-signal ring-signal/25"
                  : "bg-panel-2 text-muted-foreground ring-border"
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="text-lg font-semibold leading-none tabular-nums">
              {s.value}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
