"use client";

import { usePathname } from "next/navigation";

import { LayoutDashboard, type LucideIcon, Settings2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { dashboardHome, usePerformanceAccess } from "@/components/performance/PerformanceAccess";

export interface PerformanceNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

/**
 * Performance's navigation: the dashboard for everyone, plus Uploads and
 * Settings for intranet admins.
 */
export function usePerformanceNav() {
  const t = useTranslations("Performance");
  const pathname = usePathname();
  const { me, dashboard } = usePerformanceAccess();

  if (!me) return { items: [] };

  const extra: Omit<PerformanceNavItem, "active">[] = me.isAdmin
    ? [
        { href: "/performance/upload", label: t("navUploads"), icon: Upload },
        { href: "/performance/einstellungen", label: t("navSettings"), icon: Settings2 },
      ]
    : [];
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
