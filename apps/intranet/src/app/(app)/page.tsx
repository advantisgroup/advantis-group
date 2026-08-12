"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
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
import { useLocale, useTranslations } from "next-intl";

import {
  AdminStatsCard,
  OpenMeasuresCard,
  RecentActivityCard,
  TeamPerformanceCard,
  TeamStatusCard,
} from "@/components/dashboard/AdminWidgets";
import {
  ChatsCard,
  MyDayCard,
  MyPerformanceCard,
  MyTicketsCard,
} from "@/components/dashboard/ForYouWidgets";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
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
import { useHasCapability, useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const now = Date.now();
const startOfToday = new Date(now).setHours(0, 0, 0, 0);

const CARD_IDS = [
  "chats",
  "myday",
  "mytickets",
  "myperformance",
  "newwiki",
  "events",
  "announcements",
  "whosout",
  "celebrations",
  "teamstatus",
  "teamperformance",
  "errormeasures",
  "adminstats",
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

function WidgetGrid({ widgets }: { widgets: Widget[] }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3",
        "[&>*]:opacity-0 [&>*]:animate-[fadeInUp_0.5s_ease-out_forwards]",
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
  const locale = useLocale();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const hasActivityCapability = useHasCapability("view_activity_admin");
  const { session: performanceSession } = usePerformanceSession();
  const hasMyPerformance = Boolean(performanceSession?.valid && performanceSession.employeeId);
  const hasTeamPerformance =
    isManager &&
    Boolean(
      performanceSession?.valid && performanceSession.permissions.includes("view_all_employees"),
    );

  const events = useQuery(api.events.listForRange, {
    start: startOfToday,
    end: now + 30 * 24 * 60 * 60 * 1000,
  });
  const newWikiPages = useLatestWikiPages();
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);

  const hiddenCards = useMemo(
    () => new Set((prefs?.hiddenDashboardCards ?? []) as CardId[]),
    [prefs],
  );
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
    myperformance: t("myPerformanceTitle"),
    newwiki: t("newWikiTitle"),
    events: t("upcomingEvents"),
    announcements: t("latestAnnouncements"),
    whosout: t("whosOutToday"),
    celebrations: t("celebrationsTitle"),
    teamstatus: t("teamStatusTitle"),
    teamperformance: t("teamPerformanceTitle"),
    errormeasures: t("errorMeasuresTitle"),
    mytickets: t("myTicketsTitle"),
    adminstats: t("adminStatsTitle"),
    adminactivity: t("recentActivityTitle"),
  };

  const forYouWidgets: Widget[] = [
    widget("chats", <ChatsCard />),
    widget("myday", <MyDayCard />),
    widget("mytickets", <MyTicketsCard />),
    ...(hasMyPerformance ? [widget("myperformance", <MyPerformanceCard />)] : []),
  ].filter((w) => showCard(w.id));

  const hasNewWiki = (newWikiPages?.length ?? 0) > 0;
  const showWikiCarousel = hasNewWiki && showCard("newwiki");

  const teamCompanyWidgets: Widget[] = [
    widget("events", <EventsCard />),
    widget("announcements", <AnnouncementsCard />),
    widget("whosout", <WhosOutCard />),
    widget("celebrations", <CelebrationsCard />, true),
  ].filter((w) => showCard(w.id));

  const adminWidgets: Widget[] = [
    ...(hasActivityCapability ? [widget("teamstatus", <TeamStatusCard />)] : []),
    ...(hasTeamPerformance ? [widget("teamperformance", <TeamPerformanceCard />)] : []),
    widget("errormeasures", <OpenMeasuresCard />),
    widget("adminstats", <AdminStatsCard />),
    ...(isAdmin ? [widget("adminactivity", <RecentActivityCard />)] : []),
  ].filter((w) => showCard(w.id));

  const availableCardIds = CARD_IDS.filter((id) => {
    if (id === "myperformance") return hasMyPerformance;
    if (id === "newwiki") return hasNewWiki;
    if (id === "teamstatus") return hasActivityCapability;
    if (id === "teamperformance") return hasTeamPerformance;
    if (id === "errormeasures" || id === "adminstats" || id === "adminactivity") {
      return isManager;
    }
    return true;
  });

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

      {/* Today's schedule */}
      {todaysEvents.length > 0 && (
        <div className="mb-6 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("todaysSchedule")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {todaysEvents.map((e) => (
              <Link
                key={e._id}
                href="/calendar"
                className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {!e.allDay && (
                  <span className="tabular-nums opacity-75">{formatTime(e.start, locale)}</span>
                )}
                {e.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {forYouWidgets.length > 0 && (
        <section className="mb-8">
          <SectionHeading icon={<Heart />} title={t("sectionForYou")} />
          <WidgetGrid widgets={forYouWidgets} />
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
          <WidgetGrid widgets={teamCompanyWidgets} />
        </section>
      )}

      {isManager && adminWidgets.length > 0 && (
        <section className="mb-8">
          <SectionHeading
            icon={<ShieldCheck />}
            title={t("sectionAdmin")}
            tint="bg-amber-500/10 text-amber-600 dark:text-amber-300"
          />
          <WidgetGrid widgets={adminWidgets} />
        </section>
      )}
    </div>
  );
}
