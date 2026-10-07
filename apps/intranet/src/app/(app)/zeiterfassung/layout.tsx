"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { CalendarDays, Clock3, LayoutDashboard, Plane, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { MaintenanceScreen } from "@/components/layout/MaintenanceScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { RouteTabs } from "@/components/layout/RouteTabs";
import { useIsAdmin } from "@/components/providers/current-user";
import { PreviewBanner } from "@/components/zeiterfassung/PreviewBanner";
import { TestModeBanner } from "@/components/zeiterfassung/TestModeBanner";

export default function ZeiterfassungLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Zeiterfassung");
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  // Rollout stage (Convex TIME_MODE): test = admins and testers only,
  // preview = everyone looks but nobody clocks yet, live = everyone.
  const mode = useQuery(api.time.mode.status);
  const approvals = useQuery(api.time.admin.approvals, isAdmin && mode?.canUse ? {} : "skip");
  const waiting = approvals ? approvals.absences.length + approvals.corrections.length : 0;
  const active = pathname.split("/")[2] ?? "overview";
  const tabs = useMemo(
    () => [
      {
        value: "overview",
        href: "/zeiterfassung",
        label: t("tabs.overview"),
        icon: LayoutDashboard,
      },
      {
        value: "arbeitszeiten",
        href: "/zeiterfassung/arbeitszeiten",
        label: t("tabs.entries"),
        icon: Clock3,
      },
      {
        value: "abwesenheiten",
        href: "/zeiterfassung/abwesenheiten",
        label: t("tabs.absences"),
        icon: Plane,
      },
      {
        value: "kalender",
        href: "/zeiterfassung/kalender",
        label: t("tabs.calendar"),
        icon: CalendarDays,
      },
      ...(isAdmin
        ? [
            {
              value: "admin",
              href: "/zeiterfassung/admin",
              label: t("tabs.admin"),
              icon: Settings2,
              count: waiting > 0 ? waiting : undefined,
            },
          ]
        : []),
    ],
    [t, isAdmin, waiting],
  );

  if (mode === undefined) return null;
  if (!mode.canUse) return <MaintenanceScreen />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeaderBar
        title={t("title")}
        description={t("subtitle")}
        icon={<Clock3 className="size-4" />}
      />
      {mode.testMode && <TestModeBanner />}
      {mode.preview && (
        <PreviewBanner liveFrom={mode.liveFrom} isAdmin={isAdmin} earlyAccess={mode.earlyAccess} />
      )}
      <RouteTabs tabs={tabs} activeValue={active} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
