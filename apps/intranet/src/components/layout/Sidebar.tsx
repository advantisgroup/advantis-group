"use client";

import { useEffect, useState, type ReactNode } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCheck,
  ClipboardList,
  Clock3,
  Cloud,
  Contact,
  ExternalLink,
  Grid2X2,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  LineChart,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Newspaper,
  PhoneCall,
  RotateCcw,
  Rss,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Users,
  UserSearch,
  Wrench,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";

import { type FeatureFlagKey, useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import {
  accessibleGuidebooks,
  guidebookTitle,
  sidebarAppGuidebooks,
} from "@/components/guidebooks/registry";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { ADMIN_NAV_GROUPS } from "@/components/layout/AdminSidebar";
import {
  resolveSidebarSections,
  type SidebarSection,
  type SidebarSectionDef,
  toSavedSections,
} from "@/components/layout/sidebar-layout";
import { SidebarFavorites, SidebarTools } from "@/components/layout/SidebarExtras";
import { SidebarSections } from "@/components/layout/SidebarSections";
import { Link } from "@/components/Link";
import { MarkLogo, WordmarkLogo } from "@/components/Logo";
import {
  useCurrentUser,
  useHasCapability,
  useHasApplicantAccess,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
import { useTour } from "@/components/tour/TourProvider";
import { Button } from "@/components/ui/button";
import {
  Sidebar as SidebarShell,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarLabel,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { usePendingAbsenceCount } from "@/lib/absences-api";
import { isMaintenanceLocked } from "@/lib/maintenance";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  /** Already-resolved label, for items whose name comes from data rather than
   *  the Nav namespace (see the guidebook-backed apps below). */
  label?: string;
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

// Default workspace layout — the everyday things first, then time, reading,
// help, and the separate apps last. Anyone can rearrange it in edit mode.
const WORKSPACE_SECTIONS = [
  { id: "general", labelKey: "groupGeneral" },
  { id: "planning", labelKey: "groupPlanning" },
  { id: "knowledge", labelKey: "groupKnowledge" },
  { id: "support", labelKey: "groupSupport" },
  { id: "apps", labelKey: "groupApps" },
] as const;

type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]["id"];

function isVisible(
  item: NavItem,
  isManager: boolean,
  isAdmin: boolean,
  disabledFeatures: Set<FeatureFlagKey>,
) {
  return (
    (!item.managerOnly || isManager) &&
    (!item.adminOnly || isAdmin) &&
    (!item.featureKey || isAdmin || !disabledFeatures.has(item.featureKey)) &&
    (isAdmin || !isMaintenanceLocked(item.href))
  );
}

function RailIconLink({
  href,
  label,
  icon: Icon,
  dot,
  tourAttr,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  dot?: boolean;
  tourAttr?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          data-tour={tourAttr}
          className="relative grid size-9 place-items-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Icon className="size-[18px]" />
          {dot ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-sidebar" />
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const t = useTranslations("Nav");
  const tAdmin = useTranslations("Admin");
  const tGuidebooks = useTranslations("Guidebooks");
  const pathname = usePathname();
  const router = useRouter();
  const handleError = useErrorHandler();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const user = useCurrentUser();
  const hasFilesAccess = useHasCapability("access_files");
  const hasBlogAccess = useHasCapability("manage_blog");
  const hasApplicantAccess = useHasApplicantAccess();
  const hasClockodoTeamAccess = useHasCapability("view_clockodo_team");
  const hasInquiries = useHasCapability("manage_inquiries");
  const inquiryCounts = useQuery(api.marketing.inbox.counts, hasInquiries ? {} : "skip");
  const approvalCover = useQuery(api.org.delegations.mine);
  // Test mode: only the testers named in Convex (TIME_TESTERS) see it.
  const timeMode = useQuery(api.time.mode.status);
  const hasApprovalCover = (approvalCover?.length ?? 0) > 0;
  const canManageClockodo = useHasCapability("manage_clockodo_team");
  const pendingAbsences = usePendingAbsenceCount(canManageClockodo || hasApprovalCover);
  const { setOpenMobile, state, isMobile, editing, setEditing } = useSidebar();
  const featureFlags = useFeatureFlags();
  const disabledFeatures = new Set(
    (featureFlags ?? []).filter((f) => !f.enabled).map((f) => f.key),
  );

  const prefs = useQuery(api.people.preferences.getMine);
  const setPrefs = useMutation(api.people.preferences.setMine).withOptimisticUpdate(
    (store, patch) => {
      const current = store.getQuery(api.people.preferences.getMine, {});
      if (current) store.setQuery(api.people.preferences.getMine, {}, { ...current, ...patch });
    },
  );

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const activeUpdate = useQuery(api.updates.updates.bannerActive);
  const chatUnread = chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  const hasGuidebooks = accessibleGuidebooks(user).length > 0;

  const workspaceItems: (NavItem & { section: WorkspaceSectionId })[] = [
    {
      section: "general",
      href: "/",
      labelKey: "dashboard",
      icon: LayoutDashboard,
      tourAttr: "tour-nav-dashboard",
    },
    ...(isManager || hasApprovalCover
      ? [
          {
            section: "general" as const,
            href: "/approvals",
            labelKey: "approvals",
            icon: CheckCheck,
            badge: pendingAbsences,
          },
        ]
      : []),
    {
      section: "general",
      href: "/announcements",
      labelKey: "announcements",
      icon: Megaphone,
      badge: announcementUnread,
      tourAttr: "tour-nav-announcements",
    },
    {
      section: "general",
      href: "/chat",
      labelKey: "chat",
      icon: MessageSquare,
      badge: chatUnread,
      featureKey: "chat",
      tourAttr: "tour-nav-chat",
    },
    {
      section: "general",
      href: "/directory",
      labelKey: "directory",
      icon: Users,
      tourAttr: "tour-nav-directory",
    },
    {
      section: "planning",
      href: "/calendar",
      labelKey: "calendar",
      icon: Calendar,
      tourAttr: "tour-nav-calendar",
    },
    ...(user.clockodoUserId || hasClockodoTeamAccess || hasApprovalCover
      ? [
          {
            section: "planning" as const,
            href: "/clockodo",
            labelKey: "absences",
            icon: Clock3,
            tourAttr: "tour-nav-absences",
          },
        ]
      : []),
    // Own time tracking, next to Clockodo until the cutover. While Convex runs
    // it in test mode only the testers see it — admins included.
    ...(timeMode?.canUse
      ? [
          {
            section: "planning" as const,
            href: "/zeiterfassung",
            labelKey: "zeiterfassung",
            icon: Timer,
          },
        ]
      : []),
    ...(hasGuidebooks
      ? [
          {
            section: "knowledge" as const,
            href: "/guidebooks",
            labelKey: "guidebooks",
            icon: BookOpen,
            tourAttr: "tour-nav-guidebooks",
          },
        ]
      : []),
    { section: "knowledge", href: "/policies", labelKey: "policies", icon: ScrollText },
    ...(hasBlogAccess
      ? [{ section: "knowledge" as const, href: "/blog", labelKey: "blog", icon: Newspaper }]
      : []),
    {
      section: "support",
      href: "/help",
      labelKey: "help",
      icon: LifeBuoy,
      tourAttr: "tour-nav-help",
    },
    {
      section: "support",
      href: "/requests",
      labelKey: "myRequests",
      icon: ClipboardList,
    },
    {
      section: "support",
      href: "/who-to-ask",
      labelKey: "whoToAsk",
      icon: Contact,
    },
    ...(hasInquiries
      ? [
          {
            section: "support" as const,
            href: "/inquiries",
            labelKey: "inquiries",
            icon: Inbox,
            badge: inquiryCounts?.unseen,
          },
        ]
      : []),
    {
      section: "support",
      href: "/it-tickets",
      labelKey: "itTickets",
      icon: Wrench,
      tourAttr: "tour-nav-it-tickets",
    },
    {
      section: "support",
      href: "/fehlermanagement",
      labelKey: "errorManagement",
      icon: AlertTriangle,
    },
    {
      section: "support",
      href: "/suggestions",
      labelKey: "suggestions",
      icon: Lightbulb,
      tourAttr: "tour-nav-suggestions",
    },
    {
      section: "apps",
      href: "/performance",
      labelKey: "performance",
      icon: LineChart,
      external: true,
    },
    { section: "apps", href: "/sales-cockpit", labelKey: "salesCockpit", icon: PhoneCall },
    { section: "apps", href: "/sales-coach-ev", labelKey: "salesCoachEv", icon: Zap },
    // Products that happen to be registered as guidebooks — their own route
    // tree, their own admin area, sometimes their own auth. They were buried
    // in a drawer on the knowledge base list; here they read as what they are.
    ...sidebarAppGuidebooks(user).map((gb) => ({
      section: "apps" as const,
      href: `/guidebooks/${gb.slug}`,
      labelKey: gb.slug,
      label: guidebookTitle(gb, tGuidebooks),
      icon: gb.icon,
    })),
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

  const visibleWorkspace = workspaceItems.filter((item) =>
    isVisible(item, isManager, isAdmin, disabledFeatures),
  );
  const visibleOrganizationGroups = organizationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isVisible(item, isManager, isAdmin, disabledFeatures)),
    }))
    .filter((group) => group.items.length > 0);
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

  // Editing only makes sense for the workspace nav, so leaving it (or a tour
  // starting) ends it.
  const organizationMode = mode === "organization" && hasOrganization;
  const tourActive = !!useTour().state?.active;
  const canCustomize = !organizationMode && !tourActive;
  useEffect(() => {
    if (!canCustomize) setEditing(false);
  }, [canCustomize, setEditing]);

  // Every link either mode can show, keyed by href.
  const entries = new Map<string, { item: NavItem; label: string }>();
  for (const item of visibleWorkspace) {
    entries.set(item.href, { item, label: item.label ?? t(item.labelKey) });
  }
  for (const group of visibleOrganizationGroups) {
    for (const item of group.items) {
      entries.set(item.href, {
        item,
        label: group.namespace === "Admin" ? tAdmin(item.labelKey) : t(item.labelKey),
      });
    }
  }

  const workspaceDefaults: SidebarSectionDef[] = WORKSPACE_SECTIONS.map((s) => ({
    id: s.id,
    labelKey: s.labelKey,
    items: visibleWorkspace.filter((i) => i.section === s.id).map((i) => i.href),
  })).filter((s) => s.items.length > 0);
  const workspaceSections = resolveSidebarSections(prefs?.sidebarSections, workspaceDefaults);

  const organizationSections: SidebarSection[] = visibleOrganizationGroups.map((group) => ({
    id: `org:${group.labelKey}`,
    title: group.namespace === "Admin" ? tAdmin(group.labelKey) : t(group.labelKey),
    items: group.items.map((i) => i.href),
  }));

  // The tour points at nav items, so while it runs every section is open
  // (the saved preference is untouched and comes back once it ends).
  const collapsed = new Set(tourActive ? [] : (prefs?.collapsedSidebarSections ?? []));

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  function itemContent(href: string): ReactNode {
    const entry = entries.get(href);
    if (!entry) return null;
    const Icon = entry.item.icon;
    return (
      <>
        <Icon />
        <span className="flex-1 truncate">{entry.label}</span>
      </>
    );
  }

  function navLink(href: string) {
    const entry = entries.get(href);
    if (!entry) return null;
    const { item, label: itemLabel } = entry;
    const active = isActive(href);
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={href}>
        <SidebarMenuButton asChild active={active} tooltip={itemLabel}>
          <Link
            href={href}
            onClick={close}
            aria-current={active ? "page" : undefined}
            data-tour={item.tourAttr}
          >
            <Icon />
            <SidebarLabel>{itemLabel}</SidebarLabel>
            {item.external ? (
              <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground/70 group-data-[state=collapsed]/sidebar:hidden" />
            ) : null}
            {item.badge ? (
              <SidebarMenuBadge>{item.badge > 99 ? "99+" : item.badge}</SidebarMenuBadge>
            ) : null}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  function sectionLabel(section: SidebarSection) {
    return section.title ?? (section.labelKey ? t(section.labelKey) : "");
  }

  function toggleSection(id: string) {
    const next = collapsed.has(id) ? [...collapsed].filter((c) => c !== id) : [...collapsed, id];
    setPrefs({ collapsedSidebarSections: next }).catch(handleError);
  }

  function saveSections(next: SidebarSection[]) {
    setPrefs({ sidebarSections: toSavedSections(next) }).catch(handleError);
  }

  return (
    <SidebarShell ariaLabel="Advantis Intranet" data-tour="tour-sidebar">
      <SidebarHeader className="h-auto flex-col items-stretch justify-start gap-4 border-b border-sidebar-border px-4 pb-4 pt-3 md:gap-3 md:border-0 md:px-4 md:py-4 group-data-[state=collapsed]/sidebar:items-center group-data-[state=collapsed]/sidebar:px-0">
        <Link href="/" onClick={close} aria-label="Advantis Intranet" className="flex items-center">
          {state === "collapsed" ? <MarkLogo size={28} className="size-7" /> : <WordmarkLogo />}
        </Link>
        {editing ? (
          <div className="rounded-lg border border-sidebar-primary/30 bg-sidebar-primary/5 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-sidebar-foreground">
                {t("customizeSidebar")}
              </p>
              <Button size="sm" className="h-7 px-3 text-xs" onClick={() => setEditing(false)}>
                {t("customizeDone")}
              </Button>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-sidebar-foreground/60">
              {isMobile ? t("customizeHintTouch") : t("customizeHint")}
            </p>
            {(prefs?.sidebarSections?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() =>
                  setPrefs({ sidebarSections: [], collapsedSidebarSections: [] }).catch(handleError)
                }
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
              >
                <RotateCcw className="size-3" />
                {t("customizeReset")}
              </button>
            )}
          </div>
        ) : (
          hasOrganization && (
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
          )
        )}
      </SidebarHeader>

      <SidebarContent>
        {organizationMode ? (
          <>
            <div className="group-data-[state=collapsed]/sidebar:hidden">
              <div className="mb-2 rounded-lg border border-sidebar-border bg-sidebar-accent/35 px-3 py-2">
                <p className="text-xs font-semibold text-sidebar-foreground">
                  {t("organizationConsole")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-sidebar-foreground/55">
                  {t("organizationConsoleHint")}
                </p>
              </div>
            </div>
            <SidebarSections
              sections={organizationSections}
              collapsed={collapsed}
              sectionLabel={sectionLabel}
              renderLink={navLink}
              renderItemContent={itemContent}
              isActive={isActive}
              onToggleSection={toggleSection}
              onChange={() => {}}
            />
          </>
        ) : (
          <>
            {!editing && <SidebarFavorites onNavigate={close} />}
            {!editing && <SidebarTools />}
            <SidebarSections
              sections={workspaceSections}
              collapsed={collapsed}
              sectionLabel={sectionLabel}
              renderLink={navLink}
              renderItemContent={itemContent}
              isActive={isActive}
              onToggleSection={toggleSection}
              onChange={saveSections}
            />
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-4 py-5 md:gap-3 md:py-3">
        {/* The top bar stays minimal on mobile, so the account, preferences
            and settings controls all live here, folded into one dropdown —
            profile, language/theme and the settings link — plus a slim
            icon-only Updates button. On desktop they remain in the header
            (account/preferences) and the rail/footer links below
            (settings/updates), so this row is hidden there. */}
        <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent/60 p-1.5 md:hidden">
          <AccountMenu
            triggerClassName="h-11 flex-1 justify-start px-2 hover:bg-sidebar"
            onNavigate={close}
            showPreferences
          />
          <Link
            href="/updates"
            onClick={close}
            aria-label={t("updates")}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar hover:text-sidebar-foreground"
          >
            <Rss className="size-4 shrink-0" />
            {activeUpdate?.top ? (
              <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-primary" />
            ) : null}
          </Link>
        </div>
        {/* Collapsed desktop rail has no room for the header's account
            trigger to be reachable at a glance, so it gets its own
            icon-only entry point here — hidden everywhere else since the
            header already covers expanded desktop, and this row covers
            mobile. */}
        <div className="hidden group-data-[state=collapsed]/sidebar:block">
          <Tooltip>
            <TooltipTrigger asChild>
              <AccountMenu
                triggerClassName="h-9 w-9 justify-center px-0"
                onNavigate={close}
                hideName
              />
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              {user.name}
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Settings and Updates sit down here rather than competing with the
            main nav — shared by the desktop rail and expanded desktop
            sidebar. On mobile both are folded into the account row above
            (Settings into the dropdown, Updates as the slim icon button),
            so this block is desktop-only. The rail gets real icon buttons:
            the `md:` sizing on the expanded links outranked collapsed
            overrides and shrank them to 14px. */}
        {!isMobile &&
          (state === "collapsed" ? (
            <div className="flex flex-col items-center gap-1">
              <RailIconLink
                href="/settings"
                label={t("settings")}
                icon={Settings}
                tourAttr="tour-nav-settings"
              />
              <RailIconLink
                href="/updates"
                label={t("updates")}
                icon={Rss}
                dot={!!activeUpdate?.top}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <Link
                href="/settings"
                onClick={close}
                data-tour="tour-nav-settings"
                className={cn(
                  "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:h-auto md:rounded-md md:px-2 md:py-1.5 md:text-xs",
                  pathname.startsWith("/settings")
                    ? "text-sidebar-foreground"
                    : "text-sidebar-foreground/70",
                )}
              >
                <Settings className="size-4 shrink-0 md:size-3.5" />
                <SidebarLabel>{t("settings")}</SidebarLabel>
              </Link>
              <Link
                href="/updates"
                onClick={close}
                className="flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:h-auto md:rounded-md md:px-2 md:py-1.5 md:text-xs"
              >
                <Rss className="size-4 shrink-0 md:size-3.5" />
                <SidebarLabel>{t("updates")}</SidebarLabel>
                {activeUpdate?.top ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                ) : null}
              </Link>
            </div>
          ))}
        <div className="flex items-center justify-between gap-2 border-t border-sidebar-border pt-4 group-data-[state=collapsed]/sidebar:hidden md:border-0 md:pt-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/50 md:tracking-wider">
            Advantis Group
          </p>
          {canCustomize && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <SlidersHorizontal className="size-3" />
              {t("customize")}
            </button>
          )}
        </div>
      </SidebarFooter>
    </SidebarShell>
  );
}
