"use client";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Activity,
  BookOpen,
  Calendar,
  Cloud,
  ExternalLink,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Plane,
  Plug,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { accessibleGuidebooks } from "@/components/guidebooks/registry";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { ActivitySidebar } from "@/components/layout/ActivitySidebar";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { MarkLogo, WordmarkLogo } from "@/components/Logo";
import {
  useCurrentUser,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
import {
  Sidebar as SidebarShell,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  managerOnly?: boolean;
  adminOnly?: boolean;
  /** Marks the item as leading to a separate area (shows an external-link hint). */
  external?: boolean;
  /** Tour targeting attribute value. */
  tourAttr?: string;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export function Sidebar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const user = useCurrentUser();
  const { setOpenMobile, state } = useSidebar();

  // Context-aware nav: inside the ActivityTrack area the main nav slides out and
  // the activity nav slides in (see the sliding container below).
  const isActivity = pathname.startsWith("/admin/activity");

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const chatUnread =
    chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  const hasGuidebooks = accessibleGuidebooks(user).length > 0;

  const groups: NavGroup[] = [
    {
      labelKey: "groupGeneral",
      items: [
        {
          href: "/",
          labelKey: "dashboard",
          icon: LayoutDashboard,
          tourAttr: "tour-nav-dashboard",
        },
      ],
    },
    {
      labelKey: "groupWorkspace",
      items: [
        {
          href: "/calendar",
          labelKey: "calendar",
          icon: Calendar,
          tourAttr: "tour-nav-calendar",
        },
        {
          href: "/absences",
          labelKey: "absences",
          icon: Plane,
          tourAttr: "tour-nav-absences",
        },
        {
          href: "/announcements",
          labelKey: "announcements",
          icon: Megaphone,
          badge: announcementUnread,
          tourAttr: "tour-nav-announcements",
        },
        {
          href: "/chat",
          labelKey: "chat",
          icon: MessageSquare,
          badge: chatUnread,
          tourAttr: "tour-nav-chat",
        },
      ],
    },
    {
      labelKey: "groupResources",
      items: [
        ...(hasGuidebooks
          ? [
              {
                href: "/guidebooks",
                labelKey: "guidebooks",
                icon: BookOpen,
                tourAttr: "tour-nav-guidebooks",
              },
            ]
          : []),
        {
          href: "/files",
          labelKey: "files",
          icon: Cloud,
          tourAttr: "tour-nav-files",
        },
        {
          href: "/directory",
          labelKey: "directory",
          icon: Users,
          tourAttr: "tour-nav-directory",
        },
      ],
    },
    {
      labelKey: "groupAdministration",
      items: [
        {
          href: "/admin",
          labelKey: "admin",
          icon: ShieldCheck,
          managerOnly: true,
          tourAttr: "tour-nav-admin",
        },
        {
          href: "/admin/activity",
          labelKey: "activity",
          icon: Activity,
          adminOnly: true,
          external: true,
        },
        {
          href: "/admin/integrations",
          labelKey: "integrations",
          icon: Plug,
          managerOnly: true,
        },
        {
          href: "/settings",
          labelKey: "settings",
          icon: Settings,
          tourAttr: "tour-nav-settings",
        },
      ],
    },
  ];

  const close = () => setOpenMobile(false);

  return (
    <SidebarShell ariaLabel="Advantis Intranet" data-tour="tour-sidebar">
      <SidebarHeader>
        <Link
          href="/"
          onClick={close}
          aria-label="Advantis Intranet"
          className="flex items-center"
        >
          {state === "collapsed" ? (
            <MarkLogo size={28} className="size-7" />
          ) : (
            <WordmarkLogo />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Two nav panels laid out side-by-side; translate-X swaps between them
            when entering/leaving the activity area. Respects reduced motion. */}
        <div className="relative overflow-x-hidden">
          <div
            className={cn(
              "flex w-[200%] transition-transform duration-200 ease-out motion-reduce:transition-none",
              isActivity ? "-translate-x-1/2" : "translate-x-0"
            )}
          >
            <div
              className={cn(
                "w-1/2 shrink-0",
                isActivity && "pointer-events-none"
              )}
              aria-hidden={isActivity}
            >
              {groups.map(group => {
                const items = group.items.filter(
                  item =>
                    (!item.managerOnly || isManager) &&
                    (!item.adminOnly || isAdmin)
                );
                if (items.length === 0) return null;
                return (
                  <SidebarGroup key={group.labelKey}>
                    <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
                    <SidebarMenu>
                      {items.map(item => {
                        const active =
                          item.href === "/"
                            ? pathname === "/"
                            : item.href === "/admin"
                              ? pathname === "/admin" ||
                                (pathname.startsWith("/admin") &&
                                  !pathname.startsWith("/admin/activity") &&
                                  !pathname.startsWith("/admin/integrations"))
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
                                data-tour={item.tourAttr}
                              >
                                <Icon />
                                <SidebarLabel>{t(item.labelKey)}</SidebarLabel>
                                {item.external ? (
                                  <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground/70 group-data-[state=collapsed]/sidebar:hidden" />
                                ) : null}
                                {item.badge ? (
                                  <SidebarMenuBadge>
                                    {item.badge > 99 ? "99+" : item.badge}
                                  </SidebarMenuBadge>
                                ) : null}
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                );
              })}
            </div>
            <div
              className={cn(
                "w-1/2 shrink-0",
                !isActivity && "pointer-events-none"
              )}
              aria-hidden={!isActivity}
            >
              <ActivitySidebar />
            </div>
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="gap-3">
        {/* The top bar stays minimal on mobile, so the account and preferences
            controls live here at the bottom-left of the sidebar. On desktop
            they remain in the header, so this row is hidden there. */}
        <div className="flex items-center gap-1 border-b border-sidebar-border pb-3 md:hidden">
          <AccountMenu
            triggerClassName="h-10 flex-1 justify-start hover:bg-sidebar-accent"
            onNavigate={close}
          />
          <SettingsMenu className="shrink-0 hover:bg-sidebar-accent" />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Advantis Group
        </p>
      </SidebarFooter>
    </SidebarShell>
  );
}
