"use client";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  DatabaseZap,
  HelpCircle,
  LayoutDashboard,
  type LucideIcon,
  Monitor,
  Settings,
  Users,
  FileBarChart,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface ActivityNavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

const ACTIVITY_NAV: ActivityNavItem[] = [
  { href: "/activity", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/activity/devices", labelKey: "nav.devices", icon: Monitor },
  { href: "/activity/people", labelKey: "nav.people", icon: Users },
  {
    href: "/activity/reports",
    labelKey: "nav.reports",
    icon: FileBarChart,
  },
  {
    href: "/activity/settings",
    labelKey: "nav.settings",
    icon: Settings,
  },
  {
    href: "/activity/migration",
    labelKey: "nav.migration",
    icon: DatabaseZap,
  },
  { href: "/activity/help", labelKey: "nav.help", icon: HelpCircle },
];

/**
 * The activity-scoped navigation that slides in while the user is inside
 * `/activity/*`. Config-driven exactly like the main `Sidebar`, reusing
 * the same sidebar primitives. The first item returns the user to the normal
 * intranet admin area.
 */
export function ActivitySidebar() {
  const t = useTranslations("Activity");
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  // Registration queue: badge the Devices entry so a freshly installed agent
  // waiting for approval doesn't sit unnoticed.
  const pendingDevices = useQuery(api.activity.devices.listPending);
  const pendingCount = pendingDevices?.length ?? 0;

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("backToDashboard")}>
              <Link href="/admin" onClick={close}>
                <ArrowLeft />
                <SidebarLabel>{t("backToDashboard")}</SidebarLabel>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>{t("nav.group")}</SidebarGroupLabel>
        <SidebarMenu>
          {ACTIVITY_NAV.map((item) => {
            const active =
              item.href === "/activity" ? pathname === "/activity" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild active={active} tooltip={t(item.labelKey)}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    // The main sidebar slides off-screen inside the activity
                    // area, so the tour spotlights this Overview entry (the
                    // first item) instead of the now-hidden main-nav link.
                    data-tour={item.href === "/activity" ? "tour-nav-activity" : undefined}
                  >
                    <Icon />
                    <SidebarLabel>{t(item.labelKey)}</SidebarLabel>
                    {item.href === "/activity/devices" && pendingCount > 0 && (
                      <SidebarMenuBadge>{pendingCount}</SidebarMenuBadge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
