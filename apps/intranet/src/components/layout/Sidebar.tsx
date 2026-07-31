"use client";

import { useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type FeatureFlagKey } from "@advantis/types";
import { useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Calendar,
  Clock3,
  Cloud,
  ExternalLink,
  Grid2X2,
  LayoutDashboard,
  Lightbulb,
  LineChart,
  Megaphone,
  MessageSquare,
  Rss,
  Settings,
  ShieldCheck,
  type LucideIcon,
  UserSearch,
  Users,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";

import { useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import { accessibleGuidebooks } from "@/components/guidebooks/registry";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { ADMIN_NAV_GROUPS } from "@/components/layout/AdminSidebar";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { MarkLogo, WordmarkLogo } from "@/components/Logo";
import {
  useCurrentUser,
  useHasCapability,
  useHasApplicantAccess,
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
  icon: LucideIcon;
  badge?: number;
  managerOnly?: boolean;
  adminOnly?: boolean;
  /** Hidden for non-admins while this feature is disabled (admins still see it, to reach the toggle). */
  featureKey?: FeatureFlagKey;
  /** Marks the item as leading to a separate area (shows an external-link hint). */
  external?: boolean;
  /** Tour targeting attribute value. */
  tourAttr?: string;
}

interface NavGroup {
  labelKey: string;
  namespace?: "Nav" | "Admin";
  items: NavItem[];
}

type SidebarMode = "workspace" | "organization";

function filterGroups(
  groups: NavGroup[],
  isManager: boolean,
  isAdmin: boolean,
  disabledFeatures: Set<FeatureFlagKey>,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.managerOnly || isManager) &&
          (!item.adminOnly || isAdmin) &&
          (!item.featureKey || isAdmin || !disabledFeatures.has(item.featureKey)),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function Sidebar() {
  const t = useTranslations("Nav");
  const tAdmin = useTranslations("Admin");
  const pathname = usePathname();
  const router = useRouter();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const user = useCurrentUser();
  const hasFilesAccess = useHasCapability("access_files");
  const hasApplicantAccess = useHasApplicantAccess();
  const hasClockodoTeamAccess = useHasCapability("view_clockodo_team");
  const { setOpenMobile, state } = useSidebar();
  const featureFlags = useFeatureFlags();
  const disabledFeatures = new Set(
    (featureFlags ?? []).filter((f) => !f.enabled).map((f) => f.key),
  );

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const activeUpdate = useQuery(api.updates.bannerActive);
  const chatUnread = chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  const hasGuidebooks = accessibleGuidebooks(user).length > 0;

  const workspaceGroups: NavGroup[] = [
    {
      labelKey: "groupProject",
      items: [
        {
          href: "/",
          labelKey: "dashboard",
          icon: LayoutDashboard,
          tourAttr: "tour-nav-dashboard",
        },
        {
          href: "/directory",
          labelKey: "directory",
          icon: Users,
          tourAttr: "tour-nav-directory",
        },
        {
          href: "/chat",
          labelKey: "chat",
          icon: MessageSquare,
          badge: chatUnread,
          featureKey: "chat",
          tourAttr: "tour-nav-chat",
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
        ...(user.clockodoUserId || hasClockodoTeamAccess
          ? [
              {
                href: "/clockodo",
                labelKey: "absences",
                icon: Clock3,
                tourAttr: "tour-nav-absences",
              },
            ]
          : []),
        {
          href: "/announcements",
          labelKey: "announcements",
          icon: Megaphone,
          badge: announcementUnread,
          tourAttr: "tour-nav-announcements",
        },
        {
          href: "/suggestions",
          labelKey: "suggestions",
          icon: Lightbulb,
          tourAttr: "tour-nav-suggestions",
        },
        {
          href: "/it-tickets",
          labelKey: "itTickets",
          icon: Wrench,
          tourAttr: "tour-nav-it-tickets",
        },
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
          href: "/settings",
          labelKey: "settings",
          icon: Settings,
          tourAttr: "tour-nav-settings",
        },
        {
          href: "/fehlermanagement",
          labelKey: "errorManagement",
          icon: AlertTriangle,
        },
      ],
    },
    {
      labelKey: "groupApps",
      items: [
        {
          href: "/performance",
          labelKey: "performance",
          icon: LineChart,
          external: true,
        },
        {
          href: "/activity",
          labelKey: "activity",
          icon: Activity,
          managerOnly: true,
          featureKey: "activitytrack",
          external: true,
        },
      ],
    },
  ];

  const organizationGroups: NavGroup[] = [
    ...ADMIN_NAV_GROUPS.slice(0, 1).map((group) => ({
      labelKey: group.labelKey,
      namespace: "Admin" as const,
      items: group.items,
    })),
    {
      labelKey: "groupOrganization",
      items: [
        ...(hasFilesAccess
          ? [
              {
                href: "/files",
                labelKey: "files",
                icon: Cloud,
                tourAttr: "tour-nav-files",
              },
            ]
          : []),
        ...(hasApplicantAccess
          ? [
              {
                href: "/hr",
                labelKey: "applicants",
                icon: UserSearch,
                tourAttr: "tour-nav-applicants",
              },
            ]
          : []),
      ],
    },
    ...ADMIN_NAV_GROUPS.slice(1).map((group) => ({
      labelKey: group.labelKey,
      namespace: "Admin" as const,
      items: group.items,
    })),
  ];

  const close = () => setOpenMobile(false);

  const visibleGroups = filterGroups(workspaceGroups, isManager, isAdmin, disabledFeatures);
  const visibleOrganizationGroups = filterGroups(
    organizationGroups,
    isManager,
    isAdmin,
    disabledFeatures,
  );
  const hasOrganization = visibleOrganizationGroups.length > 0;
  const routeMode: SidebarMode =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/hr") ||
    pathname.startsWith("/applicants") ||
    pathname.startsWith("/files")
      ? "organization"
      : "workspace";
  const [mode, setMode] = useState<SidebarMode>(routeMode);

  useEffect(() => {
    setMode(routeMode);
  }, [routeMode]);

  const activeGroups =
    mode === "organization" && hasOrganization ? visibleOrganizationGroups : visibleGroups;

  function label(group: NavGroup, key: string) {
    return group.namespace === "Admin" ? tAdmin(key) : t(key);
  }

  return (
    <SidebarShell ariaLabel="Advantis Intranet" data-tour="tour-sidebar">
      <SidebarHeader className="h-auto flex-col items-stretch justify-start gap-3 py-4 group-data-[state=collapsed]/sidebar:items-center group-data-[state=collapsed]/sidebar:px-0">
        <Link href="/" onClick={close} aria-label="Advantis Intranet" className="flex items-center">
          {state === "collapsed" ? <MarkLogo size={28} className="size-7" /> : <WordmarkLogo />}
        </Link>
        {hasOrganization && (
          <div className="grid grid-cols-2 rounded-lg bg-sidebar-accent/70 p-1 group-data-[state=collapsed]/sidebar:hidden">
            <button
              type="button"
              onClick={() => {
                posthog.capture("sidebar_mode_switched", { mode: "workspace" });
                setMode("workspace");
                router.push("/");
              }}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors",
                mode === "workspace"
                  ? "bg-sidebar text-sidebar-foreground shadow-sm"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
              )}
            >
              <Grid2X2 className="size-3.5" />
              {t("workspaceMode")}
            </button>
            <button
              type="button"
              onClick={() => {
                posthog.capture("sidebar_mode_switched", { mode: "organization" });
                setMode("organization");
                router.push("/admin");
              }}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors",
                mode === "organization"
                  ? "bg-sidebar text-sidebar-foreground shadow-sm"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
              )}
            >
              <ShieldCheck className="size-3.5" />
              {t("organizationMode")}
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <div className="group-data-[state=collapsed]/sidebar:hidden">
          {mode === "organization" && hasOrganization && (
            <div className="mb-2 rounded-lg border border-sidebar-border bg-sidebar-accent/35 px-3 py-2">
              <p className="text-xs font-semibold text-sidebar-foreground">
                {t("organizationConsole")}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-sidebar-foreground/55">
                {t("organizationConsoleHint")}
              </p>
            </div>
          )}
        </div>
        {activeGroups.map((group) => (
          <SidebarGroup key={`${group.namespace ?? "Nav"}-${group.labelKey}`}>
            <SidebarGroupLabel>{label(group, group.labelKey)}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      active={active}
                      tooltip={label(group, item.labelKey)}
                    >
                      <Link
                        href={item.href}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        data-tour={item.tourAttr}
                      >
                        <Icon />
                        <SidebarLabel>{label(group, item.labelKey)}</SidebarLabel>
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
        ))}
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
        {/* Deliberately not a NavGroup item — Updates lives here, tucked next
            to the footer branding, rather than competing for space in the
            main tabs. Covers mobile too: this footer is shared by the
            desktop rail and the mobile drawer opened from BottomNav. */}
        <Link
          href="/updates"
          onClick={close}
          className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Rss className="size-3.5 shrink-0" />
          <SidebarLabel>{t("updates")}</SidebarLabel>
          {activeUpdate?.top ? (
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          ) : null}
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Advantis Group
        </p>
      </SidebarFooter>
    </SidebarShell>
  );
}
