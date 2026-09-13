"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  CalendarPlus,
  Command,
  Heart,
  Megaphone,
  NotebookPen,
  PhoneCall,
  ShieldCheck,
  Settings2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AdminStatsCard,
  ApplicantPipelineHealthCard,
  ManagerBriefCard,
  OpenMeasuresCard,
  RecentActivityCard,
  TeamAvailabilityCard,
  TeamPerformanceCard,
  TeamStatusCard,
} from "@/components/dashboard/AdminWidgets";
import {
  ChatsCard,
  MyDayCard,
  MyPerformanceCard,
  MyTicketsCard,
  MyWeekCard,
  missingProfileFields,
  ProfileCompletionCard,
} from "@/components/dashboard/ForYouWidgets";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { NeedsYouPanel, TodayPanel } from "@/components/dashboard/NeedsYou";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import {
  AnnouncementsCard,
  CelebrationsCard,
  EventsCard,
  WhosOutCard,
} from "@/components/dashboard/TeamCompanyWidgets";
import { useLatestWikiPages, WikiCarousel } from "@/components/dashboard/WikiWidgets";
import { Link } from "@/components/Link";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import {
  useCurrentUser,
  useHasCapability,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const now = Date.now();
const startOfToday = new Date(now).setHours(0, 0, 0, 0);

const CARD_IDS = [
  "chats",
  "myday",
  "myweek",
  "mytickets",
  "profilecompletion",
  "myperformance",
  "newwiki",
  "events",
  "announcements",
  "whosout",
  "celebrations",
  "teamavailability",
  "teamstatus",
  "teamperformance",
  "managerbrief",
  "errormeasures",
  "adminstats",
  "applicantpipeline",
  "adminactivity",
] as const;
type CardId = (typeof CARD_IDS)[number];

interface Widget {
  id: CardId;
  node: ReactNode;
  wide?: boolean;
}

function widget(id: CardId, node: ReactNode, wide?: boolean): Widget {
  return { id, node, wide };
}

function WidgetGrid({
  widgets,
  density,
}: {
  widgets: Widget[];
  density: "comfortable" | "compact";
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
        density === "compact" ? "gap-3" : "gap-4",
        "[&>*]:opacity-0 [&>*]:animate-[fadeInUp_0.5s_ease-out_forwards]",
        density === "compact" &&
          "[&_[data-dashboard-card-header]]:px-4 [&_[data-dashboard-card-header]]:py-2.5 [&_[data-dashboard-card-content]]:p-1 [&_[data-dashboard-row]]:py-1.5",
      )}
    >
      {widgets.map((w, i) => (
        <div
          key={w.id}
          className={cn(w.wide && "sm:col-span-2")}
          style={{ animationDelay: `${0.05 * i}s` }}
        >
          {w.node}
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const user = useCurrentUser();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const hasActivityCapability = useHasCapability("view_activity_admin");
  const { session: performanceSession } = usePerformanceSession();
  const hasMyPerformance = Boolean(performanceSession?.valid && performanceSession.employeeId);
  const profileGaps = missingProfileFields(user);
  const hasTeamPerformance =
    isManager &&
    Boolean(
      performanceSession?.valid && performanceSession.permissions.includes("view_all_employees"),
    );
  const hasApplicantPipelineHealth = isManager && (isAdmin || user.applicantAccess);

  const events = useQuery(api.events.listForRange, {
    start: startOfToday,
    end: now + 30 * 24 * 60 * 60 * 1000,
  });
  const newWikiPages = useLatestWikiPages();
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const [arrangeOpen, setArrangeOpen] = useState(false);

  const hiddenCards = useMemo(
    () => new Set((prefs?.hiddenDashboardCards ?? []) as CardId[]),
    [prefs],
  );
  const dashboardDensity = prefs?.dashboardDensity ?? "comfortable";
  const savedCardOrder = [...new Set(prefs?.dashboardCardOrder ?? [])].filter((id): id is CardId =>
    CARD_IDS.includes(id as CardId),
  );
  const orderedCardIds = [
    ...savedCardOrder,
    ...CARD_IDS.filter((id) => !savedCardOrder.includes(id)),
  ];
  const cardRank = new Map(orderedCardIds.map((id, index) => [id, index]));
  const orderWidgets = (widgets: Widget[]) =>
    [...widgets].sort((a, b) => (cardRank.get(a.id) ?? 0) - (cardRank.get(b.id) ?? 0));
  const showCard = (id: CardId) => !hiddenCards.has(id);
  async function toggleCard(id: CardId) {
    const next = new Set(hiddenCards);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    await setPrefs({ hiddenDashboardCards: [...next] });
  }

  const todaysEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (events ?? []).filter((e) => {
      const iso = (ms: number) => {
        const d = new Date(ms);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      return iso(e.start) <= today && today <= iso(e.end);
    });
  }, [events]);

  const cardLabels: Record<CardId, string> = {
    chats: t("unreadChats"),
    myday: t("yourDayTitle"),
    myweek: t("myWeekTitle"),
    profilecompletion: t("profileCompletionTitle"),
    myperformance: t("myPerformanceTitle"),
    newwiki: t("newWikiTitle"),
    events: t("upcomingEvents"),
    announcements: t("latestAnnouncements"),
    whosout: t("whosOutToday"),
    celebrations: t("celebrationsTitle"),
    teamavailability: t("teamAvailabilityTitle"),
    teamstatus: t("teamStatusTitle"),
    teamperformance: t("teamPerformanceTitle"),
    managerbrief: t("managerBriefTitle"),
    errormeasures: t("errorMeasuresTitle"),
    mytickets: t("myTicketsTitle"),
    adminstats: t("adminStatsTitle"),
    applicantpipeline: t("applicantPipelineHealthTitle"),
    adminactivity: t("recentActivityTitle"),
  };

  const forYouWidgets = orderWidgets(
    [
      widget("chats", <ChatsCard />),
      widget("myday", <MyDayCard />),
      widget("myweek", <MyWeekCard />),
      widget("mytickets", <MyTicketsCard />),
      ...(profileGaps.length
        ? [widget("profilecompletion", <ProfileCompletionCard missingFields={profileGaps} />)]
        : []),
      ...(hasMyPerformance ? [widget("myperformance", <MyPerformanceCard />)] : []),
    ].filter((w) => showCard(w.id)),
  );

  const hasNewWiki = (newWikiPages?.length ?? 0) > 0;
  const showWikiCarousel = hasNewWiki && showCard("newwiki");

  const teamCompanyWidgets = orderWidgets(
    [
      widget("events", <EventsCard />),
      widget("announcements", <AnnouncementsCard />),
      widget("whosout", <WhosOutCard />),
      widget("celebrations", <CelebrationsCard />, true),
    ].filter((w) => showCard(w.id)),
  );

  const adminWidgets = orderWidgets(
    [
      widget("managerbrief", <ManagerBriefCard />),
      ...(user.teams.length ? [widget("teamavailability", <TeamAvailabilityCard />)] : []),
      ...(hasActivityCapability ? [widget("teamstatus", <TeamStatusCard />)] : []),
      ...(hasTeamPerformance ? [widget("teamperformance", <TeamPerformanceCard />)] : []),
      widget("errormeasures", <OpenMeasuresCard />),
      widget("adminstats", <AdminStatsCard />),
      ...(hasApplicantPipelineHealth
        ? [widget("applicantpipeline", <ApplicantPipelineHealthCard />)]
        : []),
      ...(isAdmin ? [widget("adminactivity", <RecentActivityCard />)] : []),
    ].filter((w) => showCard(w.id)),
  );

  const availableCardIds = CARD_IDS.filter((id) => {
    if (id === "myperformance") return hasMyPerformance;
    if (id === "profilecompletion") return profileGaps.length > 0;
    if (id === "newwiki") return hasNewWiki;
    if (id === "teamstatus") return hasActivityCapability;
    if (id === "teamavailability") return isManager && user.teams.length > 0;
    if (id === "teamperformance") return hasTeamPerformance;
    if (id === "applicantpipeline") return hasApplicantPipelineHealth;
    if (id === "errormeasures" || id === "adminstats" || id === "adminactivity") {
      return isManager;
    }
    return true;
  });
  const reorderableCardIds = orderedCardIds.filter(
    (id) => id !== "newwiki" && availableCardIds.includes(id),
  );

  async function moveCard(id: CardId, direction: -1 | 1) {
    const currentIndex = orderedCardIds.indexOf(id);
    const visibleIds = new Set(reorderableCardIds);
    let targetIndex = currentIndex + direction;
    while (
      targetIndex >= 0 &&
      targetIndex < orderedCardIds.length &&
      !visibleIds.has(orderedCardIds[targetIndex])
    ) {
      targetIndex += direction;
    }
    if (targetIndex < 0 || targetIndex >= orderedCardIds.length) return;
    const next = [...orderedCardIds];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    await setPrefs({ dashboardCardOrder: next });
  }

  return (
    <div className="mx-auto max-w-6xl" data-tour="tour-dashboard-main">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <GreetingHeader />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("customize")}
              className="text-muted-foreground"
              data-tour="tour-dashboard-customize"
            >
              <Settings2 />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("customize")}</DropdownMenuLabel>
            {availableCardIds.map((id) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={showCard(id)}
                onCheckedChange={() => void toggleCard(id)}
              >
                {cardLabels[id]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("cardDensity")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={dashboardDensity}
              onValueChange={(value) =>
                void setPrefs({ dashboardDensity: value as "comfortable" | "compact" })
              }
            >
              <DropdownMenuRadioItem value="comfortable">
                {t("densityComfortable")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">{t("densityCompact")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setArrangeOpen(true)}>
              {t("arrangeCards")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quick actions */}
      <div
        className="-mx-1 mb-6 flex items-center gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        data-tour="tour-dashboard-actions"
      >
        {isManager && (
          <>
            <Button variant="outline" size="sm" className="h-10 shrink-0 sm:h-8" asChild>
              <Link href="/calendar?new=1">
                <CalendarPlus className="mr-1.5 size-3.5" />
                {t("actionNewEvent")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-10 shrink-0 sm:h-8" asChild>
              <Link href="/announcements/new">
                <Megaphone className="mr-1.5 size-3.5" />
                {t("actionNewAnnouncement")}
              </Link>
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" className="h-10 shrink-0 sm:h-8" asChild>
          <Link href="/files">
            <Upload className="mr-1.5 size-3.5" />
            {t("actionUpload")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="h-10 shrink-0 sm:h-8" asChild>
          <Link href="/sales-cockpit">
            <PhoneCall className="mr-1.5 size-3.5" />
            {t("actionSalesCockpit")}
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("command-palette:open"))}
          className="ml-auto hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent md:flex"
        >
          <Command className="size-3" />
          {t("paletteHint")}
        </button>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NeedsYouPanel />
        <TodayPanel events={todaysEvents} />
      </div>

      {forYouWidgets.length > 0 && (
        <section className="mb-8">
          <SectionHeading icon={<Heart />} title={t("sectionForYou")} />
          <WidgetGrid widgets={forYouWidgets} density={dashboardDensity} />
        </section>
      )}

      {showWikiCarousel && (
        <section className="mb-8">
          <SectionHeading
            icon={<NotebookPen />}
            title={t("sectionNewWiki")}
            tint="bg-violet-500/10 text-violet-600 dark:text-violet-300"
          />
          <WikiCarousel />
        </section>
      )}

      {teamCompanyWidgets.length > 0 && (
        <section className="mb-8">
          <SectionHeading
            icon={<Building2 />}
            title={t("sectionTeamCompany")}
            tint="bg-sky-500/10 text-sky-600 dark:text-sky-300"
          />
          <WidgetGrid widgets={teamCompanyWidgets} density={dashboardDensity} />
        </section>
      )}

      {isManager && adminWidgets.length > 0 && (
        <section className="mb-8">
          <SectionHeading
            icon={<ShieldCheck />}
            title={t("sectionAdmin")}
            tint="bg-amber-500/10 text-amber-600 dark:text-amber-300"
          />
          <WidgetGrid widgets={adminWidgets} density={dashboardDensity} />
        </section>
      )}

      <Dialog open={arrangeOpen} onOpenChange={setArrangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("arrangeCards")}</DialogTitle>
            <DialogDescription>{t("arrangeCardsDescription")}</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border/60 rounded-lg border border-border/70">
            {reorderableCardIds.map((id, index) => (
              <div key={id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {cardLabels[id]}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("moveCardUp", { name: cardLabels[id] })}
                  disabled={index === 0}
                  onClick={() => void moveCard(id, -1)}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("moveCardDown", { name: cardLabels[id] })}
                  disabled={index === reorderableCardIds.length - 1}
                  onClick={() => void moveCard(id, 1)}
                >
                  <ChevronDown className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setArrangeOpen(false)}>
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
