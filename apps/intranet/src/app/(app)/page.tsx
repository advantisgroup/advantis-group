"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CalendarPlus,
  Command,
  EyeOff,
  Heart,
  Megaphone,
  PhoneCall,
  Plus,
  RotateCcw,
  ShieldCheck,
  Settings2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useAiEnabled } from "@/components/ai/use-ai-enabled";
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
import { AiBriefCard } from "@/components/dashboard/AiBriefCard";
import { AiNavigateCard } from "@/components/dashboard/AiNavigateCard";
import { EditableGrid, type GridWidget } from "@/components/dashboard/EditableGrid";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { NeedsYouPanel, TodayPanel } from "@/components/dashboard/NeedsYou";
import { type DashCardSize } from "@/components/dashboard/primitives";
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
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const now = Date.now();
const startOfToday = new Date(now).setHours(0, 0, 0, 0);

const CARD_IDS = [
  "aibrief",
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

const DEFAULT_SIZES: Partial<Record<CardId, DashCardSize>> = { celebrations: "wide" };

interface Widget {
  id: CardId;
  node: ReactNode;
}

function widget(id: CardId, node: ReactNode): Widget {
  return { id, node };
}

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const handleError = useErrorHandler();
  const isMobile = useIsMobile();
  const user = useCurrentUser();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const aiEnabled = useAiEnabled();
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
  const setPrefs = useMutation(api.userPreferences.setMine).withOptimisticUpdate((store, patch) => {
    const current = store.getQuery(api.userPreferences.getMine, {});
    if (current) store.setQuery(api.userPreferences.getMine, {}, { ...current, ...patch });
  });
  const save = (patch: Parameters<typeof setPrefs>[0]) => void setPrefs(patch).catch(handleError);

  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const hiddenCards = useMemo(
    () => new Set((prefs?.hiddenDashboardCards ?? []) as CardId[]),
    [prefs],
  );
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
  const sizeOf = (id: CardId): DashCardSize =>
    (prefs?.dashboardCardSizes?.[id] as DashCardSize | undefined) ?? DEFAULT_SIZES[id] ?? "normal";

  function setHidden(id: CardId, hidden: boolean) {
    const next = new Set(hiddenCards);
    if (hidden) next.add(id);
    else next.delete(id);
    save({ hiddenDashboardCards: [...next] });
  }

  /** A section's new order, slotted back into the one global order — cards
   * from other sections (and hidden ones) keep their places. */
  function reorderSection(ids: string[]) {
    const moved = new Set(ids);
    const queue = [...ids];
    save({
      dashboardCardOrder: orderedCardIds.map((id) => (moved.has(id) ? (queue.shift() ?? id) : id)),
    });
  }

  function resizeCard(id: string, size: DashCardSize) {
    save({ dashboardCardSizes: { ...(prefs?.dashboardCardSizes ?? {}), [id]: size } });
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
    aibrief: t("briefTitle"),
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

  const toGrid = (widgets: Widget[]): GridWidget[] =>
    orderWidgets(widgets.filter((w) => showCard(w.id))).map((w) => ({
      id: w.id,
      label: cardLabels[w.id],
      node: w.node,
      size: sizeOf(w.id),
    }));

  const forYouWidgets = toGrid([
    widget("chats", <ChatsCard />),
    widget("myday", <MyDayCard />),
    widget("myweek", <MyWeekCard />),
    widget("mytickets", <MyTicketsCard />),
    ...(profileGaps.length
      ? [widget("profilecompletion", <ProfileCompletionCard missingFields={profileGaps} />)]
      : []),
    ...(hasMyPerformance ? [widget("myperformance", <MyPerformanceCard />)] : []),
  ]);

  const hasNewWiki = (newWikiPages?.length ?? 0) > 0;
  const showWikiCarousel = hasNewWiki && showCard("newwiki");

  const teamCompanyWidgets = toGrid([
    widget("events", <EventsCard />),
    widget("announcements", <AnnouncementsCard />),
    widget("whosout", <WhosOutCard />),
    widget("celebrations", <CelebrationsCard />),
  ]);

  const adminWidgets = toGrid([
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
  ]);

  const availableCardIds = CARD_IDS.filter((id) => {
    if (id === "aibrief") return aiEnabled;
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
  const hiddenAvailable = availableCardIds.filter((id) => hiddenCards.has(id));
  const customized =
    hiddenCards.size > 0 ||
    savedCardOrder.length > 0 ||
    Object.keys(prefs?.dashboardCardSizes ?? {}).length > 0;

  // Everything that isn't a card steps back while editing, so the cards are
  // clearly the thing being worked on.
  const inert = cn(
    "transition-[opacity,filter] duration-300",
    editing && "pointer-events-none select-none opacity-35 blur-[1.5px]",
  );

  /** A block that isn't a movable card (AI brief, wiki) can still be hidden. */
  function hideable(id: CardId, node: ReactNode) {
    return (
      <div className="relative">
        <div className={cn(editing && "pointer-events-none select-none")}>{node}</div>
        {editing && (
          <button
            type="button"
            onClick={() => setHidden(id, true)}
            aria-label={t("editHide", { name: cardLabels[id] })}
            title={t("editHide", { name: cardLabels[id] })}
            className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-lg border border-border/70 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:bg-destructive/10 hover:text-destructive sm:size-7"
          >
            <EyeOff className="size-3.5" />
          </button>
        )}
      </div>
    );
  }

  function section(icon: ReactNode, title: string, widgets: GridWidget[]) {
    if (widgets.length === 0) return null;
    return (
      <section className="mb-6 sm:mb-8">
        <SectionHeading icon={icon} title={title} />
        <EditableGrid
          widgets={widgets}
          editing={editing}
          onReorder={reorderSection}
          onResize={resizeCard}
          onHide={(id) => setHidden(id as CardId, true)}
        />
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl" data-tour="tour-dashboard-main">
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="sticky top-0 z-30 -mx-1 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-sky-500/30 bg-background/90 px-4 py-3 shadow-lg shadow-black/5 backdrop-blur-xl"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("editTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {isMobile ? t("editHintTouch") : t("editHint")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {customized && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    save({
                      hiddenDashboardCards: [],
                      dashboardCardOrder: [],
                      dashboardCardSizes: {},
                    })
                  }
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {t("editReset")}
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing(false)}>
                {t("done")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
        <div className={inert}>
          <GreetingHeader />
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("customize")}
            title={t("customize")}
            className="-mr-2 -mt-1 shrink-0 text-muted-foreground sm:mr-0 sm:mt-0 sm:size-8"
            data-tour="tour-dashboard-customize"
            onClick={() => setEditing(true)}
          >
            <Settings2 className="size-4" />
          </Button>
        )}
      </div>

      {/* Quick actions — a swipeable row on phones, fading out at the edge
          so it reads as "there's more" rather than cut off. */}
      <div
        className={cn(
          "-mx-4 mb-5 flex items-center gap-2 overflow-x-auto px-4 pb-1 [-webkit-overflow-scrolling:touch] [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none] sm:mx-0 sm:mb-6 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden",
          inert,
        )}
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

      {aiEnabled &&
        showCard("aibrief") &&
        hideable(
          "aibrief",
          <div className="mb-3 grid gap-3 sm:mb-4 sm:gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <AiBriefCard />
            <AiNavigateCard />
          </div>,
        )}

      <div
        className={cn(
          "mb-6 grid gap-3 sm:mb-8 sm:gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
          inert,
        )}
      >
        <NeedsYouPanel />
        <TodayPanel events={todaysEvents} />
      </div>

      {section(<Heart />, t("sectionForYou"), forYouWidgets)}

      {showWikiCarousel && (
        <section className="mb-6 sm:mb-8">{hideable("newwiki", <WikiCarousel />)}</section>
      )}

      {section(<Building2 />, t("sectionTeamCompany"), teamCompanyWidgets)}

      {isManager && section(<ShieldCheck />, t("sectionAdmin"), adminWidgets)}

      {/* Hidden cards wait here while editing, one tap from coming back. */}
      <AnimatePresence>
        {editing && hiddenAvailable.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-8 rounded-2xl border border-dashed border-border p-4"
          >
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <EyeOff className="size-4 text-muted-foreground" />
              {t("editHiddenTitle")}
            </p>
            <div className="flex flex-wrap gap-2">
              {hiddenAvailable.map((id) => (
                <motion.button
                  key={id}
                  layout
                  type="button"
                  onClick={() => setHidden(id, false)}
                  aria-label={t("editShow", { name: cardLabels[id] })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-sm font-medium transition-colors hover:border-sky-500/50 hover:bg-sky-500/[0.07]"
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  {cardLabels[id]}
                </motion.button>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
