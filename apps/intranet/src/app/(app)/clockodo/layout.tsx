"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { CalendarDays, Clock3, LayoutDashboard, Link2Off, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { Mark } from "@/components/branding/ProviderMark";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { StatusScreen } from "@/components/layout/StatusScreen";
import { Link } from "@/components/Link";
import { useCurrentUser, useHasCapability } from "@/components/providers/current-user";
import { TourFirstVisitNudge } from "@/components/tour";
import { Button } from "@/components/ui/button";

export default function ClockodoLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Absences");
  const pathname = usePathname();
  const user = useCurrentUser();
  const hasTeamAccess = useHasCapability("view_clockodo_team");
  const canManageClockodo = useHasCapability("manage_clockodo_team");
  const migrateLegacyLink = useMutation(api.integrations.clockodoLink.migrateLegacyClockodoLink);
  const migrationStarted = useRef(false);
  const [migrationPending, setMigrationPending] = useState(!user.clockodoUserId);
  // requests/approvals/planner all live under one "Absences" tab (with their
  // own in-page sub-nav, see AbsencesSubNav in page.tsx) — keeping them as 3
  // separate top-level tabs was both confusing (unclear how they related to
  // each other) and, combined with dashboard/timetable/admin, overflowed the
  // mobile bottom-nav pill for a full manager's tab set.
  const ABSENCE_ROUTE_SEGMENTS = ["requests", "approvals", "planner"];
  const rawSection = pathname.split("/")[2] ?? "dashboard";
  const active = ABSENCE_ROUTE_SEGMENTS.includes(rawSection) ? "absences" : rawSection;
  const tabs = [
    { value: "dashboard", href: "/clockodo", label: t("section.dashboard"), icon: LayoutDashboard },
    {
      value: "timetable",
      href: "/clockodo/timetable",
      label: t("section.timetable"),
      icon: CalendarDays,
    },
    {
      value: "absences",
      href: "/clockodo/requests",
      label: t("section.absences"),
      icon: Clock3,
    },
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

  if (!user.clockodoUserId && !hasTeamAccess) {
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
      <PageHeaderBar
        title={t("title")}
        description={t("subtitle")}
        icon={<Mark provider="clockodo" className="h-4 w-auto md:h-[18px]" />}
        tourCheckpoint="absences"
      />
      <TourFirstVisitNudge checkpointId="absences" />
      <RouteTabs tabs={tabs} activeValue={active} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
