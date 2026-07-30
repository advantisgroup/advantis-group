"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  Link2Off,
  Settings2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { StatusScreen } from "@/components/layout/StatusScreen";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import {
  useCurrentUser,
  useHasCapability,
  useIsManager,
} from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";

export default function ClockodoLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Absences");
  const pathname = usePathname();
  const user = useCurrentUser();
  const isManager = useIsManager();
  const canManageClockodo = useHasCapability("access_integrations");
  const migrateLegacyLink = useMutation(api.integrations.clockodoLink.migrateLegacyClockodoLink);
  const migrationStarted = useRef(false);
  const [migrationPending, setMigrationPending] = useState(!user.clockodoUserId);
  const active = pathname.split("/")[2] ?? "dashboard";
  const tabs = [
    { value: "dashboard", href: "/clockodo", label: t("section.dashboard"), icon: LayoutDashboard },
    {
      value: "timetable",
      href: "/clockodo/timetable",
      label: t("section.timetable"),
      icon: CalendarDays,
    },
    { value: "requests", href: "/clockodo/requests", label: t("section.requests"), icon: Clock3 },
    {
      value: "planner",
      href: "/clockodo/planner",
      label: t("section.planner"),
      icon: CalendarDays,
    },
    ...(isManager
      ? [
          {
            value: "reports",
            href: "/clockodo/reports",
            label: t("section.reports"),
            icon: BarChart3,
          },
        ]
      : []),
    ...(canManageClockodo
      ? [{ value: "admin", href: "/clockodo/admin", label: t("section.admin"), icon: Settings2 }]
      : []),
  ];

  useEffect(() => {
    if (user.clockodoUserId) {
      setMigrationPending(false);
      return;
    }
    if (migrationStarted.current) return;
    migrationStarted.current = true;
    void migrateLegacyLink({})
      .then((result) => {
        if (result.status !== "migrated") setMigrationPending(false);
      })
      .catch(() => setMigrationPending(false));
  }, [migrateLegacyLink, user.clockodoUserId]);

  if (!user.clockodoUserId && migrationPending) {
    return (
      <StatusScreen
        icon={Clock3}
        code={t("migrationCode")}
        title={t("migrationTitle")}
        description={t("migrationDescription")}
      />
    );
  }

  if (!user.clockodoUserId) {
    return (
      <StatusScreen
        icon={Link2Off}
        code={t("linkRequiredCode")}
        title={t("linkRequiredTitle")}
        description={t("linkRequiredDescription")}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t("linkRequiredAction")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} icon={<Clock3 />} />
      <RouteTabs tabs={tabs} activeValue={active} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
