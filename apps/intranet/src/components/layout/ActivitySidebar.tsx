"use client";

import { usePathname } from "next/navigation";

import {
  ArrowLeft,
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
  { href: "/admin/activity", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/admin/activity/devices", labelKey: "nav.devices", icon: Monitor },
  { href: "/admin/activity/people", labelKey: "nav.people", icon: Users },
  {
    href: "/admin/activity/reports",
    labelKey: "nav.reports",
    icon: FileBarChart,
  },
  {
    href: "/admin/activity/settings",
    labelKey: "nav.settings",
    icon: Settings,
  },
  { href: "/admin/activity/help", labelKey: "nav.help", icon: HelpCircle },
];

/**
 * The activity-scoped navigation that slides in while the user is inside
 * `/admin/activity/*`. Config-driven exactly like the main `Sidebar`, reusing
 * the same sidebar primitives. The first item returns the user to the normal
 * intranet admin area.
 */
export function ActivitySidebar() {
  const t = useTranslations("Activity");
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);

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
          {ACTIVITY_NAV.map(item => {
            const active =
              item.href === "/admin/activity"
                ? pathname === "/admin/activity"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  active={active}
                  tooltip={t(item.labelKey)}
                >
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon />
                    <SidebarLabel>{t(item.labelKey)}</SidebarLabel>
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
