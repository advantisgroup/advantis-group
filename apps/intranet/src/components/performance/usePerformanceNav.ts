"use client";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { LayoutDashboard, type LucideIcon, Rocket, Settings2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { dashboardHome, usePerformanceAccess } from "@/components/performance/PerformanceAccess";

export interface PerformanceNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

/**
 * Performance's navigation: the dashboard for everyone, the Onboarding
 * cockpit for whoever may open it (admins until `ONBOARDING_MODE=live`),
 * plus Uploads and Settings for intranet admins.
 */
export function usePerformanceNav() {
  const t = useTranslations("Performance");
  const pathname = usePathname();
  const tOnboarding = useTranslations("OnboardingCockpit");
  const { me, dashboard } = usePerformanceAccess();
  const onboarding = useQuery(api.performance.onboarding.me, me ? {} : "skip");

  if (!me) return { items: [] };

  const extra: Omit<PerformanceNavItem, "active">[] = [
    ...(onboarding?.access
      ? [{ href: "/performance/onboarding", label: tOnboarding("nav"), icon: Rocket }]
      : []),
    ...(me.isAdmin
      ? [
          { href: "/performance/upload", label: t("navUploads"), icon: Upload },
          { href: "/performance/einstellungen", label: t("navSettings"), icon: Settings2 },
        ]
      : []),
  ];
  const onExtra = extra.some((item) => pathname.startsWith(item.href));

  const items: PerformanceNavItem[] = [
    {
      href: dashboardHome(dashboard),
      label: t("navDashboard"),
      icon: LayoutDashboard,
      active: !onExtra,
    },
    ...extra.map((item) => ({ ...item, active: pathname.startsWith(item.href) })),
  ];

  // A lone "Dashboard" link isn't navigation, just noise.
  return { items: items.length > 1 ? items : [] };
}
