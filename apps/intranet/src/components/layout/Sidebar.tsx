"use client";

import { usePathname } from "next/navigation";

import { useQuery } from "convex/react";
import {
  Activity,
  BookOpen,
  Calendar,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Plane,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";

import { accessibleGuidebooks } from "@/components/guidebooks/registry";
import { ActivitySidebar } from "@/components/layout/ActivitySidebar";
import { Link } from "@/components/Link";
import { MarkLogo, WordmarkLogo } from "@/components/Logo";
import {
  useCurrentUser,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
import { cn } from "@/lib/utils";
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

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  managerOnly?: boolean;
  adminOnly?: boolean;
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
      items: [{ href: "/", labelKey: "dashboard", icon: LayoutDashboard }],
    },
    {
      labelKey: "groupWorkspace",
      items: [
        { href: "/calendar", labelKey: "calendar", icon: Calendar },
        { href: "/absences", labelKey: "absences", icon: Plane },
        {
          href: "/announcements",
          labelKey: "announcements",
          icon: Megaphone,
          badge: announcementUnread,
        },
        {
          href: "/chat",
          labelKey: "chat",
          icon: MessageSquare,
          badge: chatUnread,
        },
      ],
    },
    {
      labelKey: "groupResources",
      items: [
        ...(hasGuidebooks
          ? [{ href: "/guidebooks", labelKey: "guidebooks", icon: BookOpen }]
          : []),
        { href: "/directory", labelKey: "directory", icon: Users },
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
        },
        {
          href: "/admin/activity",
          labelKey: "activity",
          icon: Activity,
          adminOnly: true,
        },
        { href: "/settings", labelKey: "settings", icon: Settings },
      ],
    },
  ];

  const close = () => setOpenMobile(false);

  return (
    <SidebarShell ariaLabel="Advantis Intranet">
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
                                  !pathname.startsWith("/admin/activity"))
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

      <SidebarFooter>
        <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Advantis Group
        </p>
      </SidebarFooter>
    </SidebarShell>
  );
}
