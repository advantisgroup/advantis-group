"use client";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Building2,
  Clock,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  Plug,
  PowerOff,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
  Users2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useHasCapability, useIsAdmin, useIsManager } from "@/components/providers/current-user";
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

export interface AdminNavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  managerOnly?: boolean;
  adminOnly?: boolean;
}

export interface AdminNavGroup {
  labelKey: string;
  items: AdminNavItem[];
  /**
   * Set-and-forget configuration. Real admins reach for these a handful of
   * times a year, so the sidebar tucks them behind one disclosure instead of
   * making everyone scroll past them on every visit.
   */
  advanced?: boolean;
}

/**
 * The full `/admin` nav, categorized. Exported so the Overview page can
 * render the same sections as quick-access cards instead of maintaining a
 * second, drift-prone copy of "what's in the admin area."
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    labelKey: "nav.groupGeneral",
    items: [{ href: "/admin", labelKey: "nav.overview", icon: LayoutDashboard }],
  },
  {
    labelKey: "nav.groupAccess",
    items: [
      {
        href: "/admin/requests",
        labelKey: "nav.requests",
        icon: Clock,
        managerOnly: true,
      },
      {
        href: "/admin/invites",
        labelKey: "nav.invites",
        icon: Mail,
        managerOnly: true,
      },
      {
        href: "/admin/members",
        labelKey: "nav.members",
        icon: Users,
        managerOnly: true,
      },
      {
        href: "/admin/roles",
        labelKey: "nav.roles",
        icon: ShieldCheck,
        managerOnly: true,
      },
      {
        href: "/admin/password-resets",
        labelKey: "nav.passwordResets",
        icon: KeyRound,
        adminOnly: true,
      },
      {
        href: "/admin/authentication",
        labelKey: "nav.authentication",
        icon: ShieldAlert,
        adminOnly: true,
      },
    ],
  },
  {
    labelKey: "nav.groupSystem",
    items: [
      { href: "/admin/uploads", labelKey: "nav.uploads", icon: Upload },
      {
        href: "/admin/integrations",
        labelKey: "nav.integrations",
        icon: Plug,
      },
    ],
  },
  {
    labelKey: "nav.groupAdvanced",
    advanced: true,
    items: [
      {
        href: "/admin/departments",
        labelKey: "nav.departments",
        icon: Building2,
        adminOnly: true,
      },
      {
        href: "/admin/teams",
        labelKey: "nav.teams",
        icon: Users2,
        adminOnly: true,
      },
      {
        href: "/admin/audit",
        labelKey: "nav.audit",
        icon: ScrollText,
        adminOnly: true,
      },
      {
        href: "/admin/feature-flags",
        labelKey: "nav.featureFlags",
        icon: PowerOff,
        adminOnly: true,
      },
    ],
  },
];

/**
 * The admin-scoped navigation that slides in while the user is inside
 * `/admin/*` (but not `/admin/integrations/*`, which has its own dedicated
 * sidebar/gate; ActivityTrack lives entirely outside `/admin` now, at
 * `/activity`, with its own sliding panel — see `ActivitySidebar`).
 * Config-driven exactly like `ActivitySidebar`, reusing the same sidebar
 * primitives. The first item returns to the normal intranet nav. Items are
 * grouped by function (access & people, organization, system) rather than
 * one long flat list.
 */
export function AdminSidebar() {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const hasUploadsView = useHasCapability("manage_uploads");

  // Pending upload requests badge the Uploads entry the same way Devices is
  // badged in ActivitySidebar — a manager approving requests shouldn't have
  // to open the section just to see there's something waiting.
  const pendingUploads = useQuery(
    api.onedrive.listPending,
    isManager || hasUploadsView ? {} : "skip",
  );
  const pendingCount = pendingUploads?.length ?? 0;
  const pendingResets = useQuery(api.passwordResets.pendingCount, isAdmin ? {} : "skip") ?? 0;

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("backToDashboard")}>
              <Link href="/" onClick={close}>
                <ArrowLeft />
                <SidebarLabel>{t("backToDashboard")}</SidebarLabel>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      {ADMIN_NAV_GROUPS.map((group) => {
        const items = group.items.filter(
          (item) => (!item.managerOnly || isManager) && (!item.adminOnly || isAdmin),
        );
        if (items.length === 0) return null;
        return (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild active={active} tooltip={t(item.labelKey)}>
                      <Link
                        href={item.href}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        data-tour={item.href === "/admin" ? "tour-nav-admin" : undefined}
                      >
                        <Icon />
                        <SidebarLabel>{t(item.labelKey)}</SidebarLabel>
                        {item.href === "/admin/uploads" && pendingCount > 0 && (
                          <SidebarMenuBadge>
                            {pendingCount > 99 ? "99+" : pendingCount}
                          </SidebarMenuBadge>
                        )}
                        {item.href === "/admin/password-resets" && pendingResets > 0 && (
                          <SidebarMenuBadge>
                            {pendingResets > 99 ? "99+" : pendingResets}
                          </SidebarMenuBadge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </>
  );
}
