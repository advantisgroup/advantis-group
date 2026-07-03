"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Command,
  MapPin,
  Megaphone,
  MessageSquare,
  Plane,
  Plus,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { htmlToText } from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { isoToday } from "@/lib/absences";
import {
  formatDateTime,
  formatIsoDate,
  formatTime,
  initials,
  relativeTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const now = Date.now();
const startOfToday = new Date(now).setHours(0, 0, 0, 0);

const CARD_IDS = [
  "events",
  "announcements",
  "chats",
  "whosout",
  "approvals",
] as const;
type CardId = (typeof CARD_IDS)[number];

function DashCard({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <Card className="group/card overflow-hidden transition-shadow hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-18px_rgb(0_0_0/0.18)]">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-[18px]">
          {icon}
        </span>
        <h2 className="flex-1 text-sm font-semibold tracking-tight">{title}</h2>
        {count ? (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold tabular-nums text-primary">
            {count}
          </span>
        ) : null}
      </div>
      <div className="p-2">{children}</div>
    </Card>
  );
}

function Empty({
  children,
  href,
  linkLabel,
}: {
  children: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="px-3 py-6 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      {href && linkLabel && (
        <Link
          href={href}
          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function RowSkeletons() {
  return (
    <div className="space-y-2 px-3 py-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rich list row: optional leading visual, title, subtitle, trailing meta. */
function Row({
  href,
  leading,
  title,
  subtitle,
  trailing,
}: {
  href: string;
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailing ? (
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {trailing}
        </div>
      ) : null}
    </Link>
  );
}

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const user = useCurrentUser();
  const isManager = useIsManager();
  const handleError = useErrorHandler();
  const events = useQuery(api.events.listForRange, {
    start: startOfToday,
    end: now + 30 * 24 * 60 * 60 * 1000,
  });
  const announcements = useQuery(api.announcements.list, { limit: 5 });
  const conversations = useQuery(api.chat.listConversations);
  const pending = useQuery(
    api.absences.pendingForApproval,
    isManager ? {} : "skip"
  );
  const myAbsences = useQuery(api.absences.myAbsences);
  const today = isoToday();
  const outToday = useQuery(api.absences.listForCalendar, {
    start: today,
    end: today,
  });
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const approve = useMutation(api.absences.approve);
  const deny = useMutation(api.absences.deny);

  const hiddenCards = useMemo(
    () => new Set((prefs?.hiddenDashboardCards ?? []) as CardId[]),
    [prefs]
  );
  const showCard = (id: CardId) => !hiddenCards.has(id);
  async function toggleCard(id: CardId) {
    const next = new Set(hiddenCards);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    await setPrefs({ hiddenDashboardCards: [...next] });
  }

  const unreadChats = conversations?.filter(c => c.unread > 0) ?? [];
  const todayLabel = new Date(now).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const hour = new Date().getHours();
  const greetingKey =
    hour < 12
      ? "greetingMorning"
      : hour < 18
        ? "greetingAfternoon"
        : "greetingEvening";

  const nextAbsence = useMemo(() => {
    return (myAbsences ?? [])
      .filter(a => a.status === "approved" && a.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  }, [myAbsences, today]);

  const todaysEvents = useMemo(
    () =>
      (events ?? []).filter(e => {
        const iso = (ms: number) => {
          const d = new Date(ms);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };
        return iso(e.start) <= today && today <= iso(e.end);
      }),
    [events, today]
  );

  async function decide(
    absenceId: Id<"absences">,
    action: "approve" | "deny"
  ) {
    try {
      if (action === "approve") {
        await approve({ absenceId });
        toast.success(tAbs("approved"));
      } else {
        await deny({ absenceId });
        toast.success(tAbs("denied"));
      }
    } catch (e) {
      handleError(e);
    }
  }

  const cardLabels: Record<CardId, string> = {
    events: t("upcomingEvents"),
    announcements: t("latestAnnouncements"),
    chats: t("unreadChats"),
    whosout: t("whosOutToday"),
    approvals: t("pendingApprovals"),
  };

  return (
    <div className="mx-auto max-w-5xl" data-tour="tour-dashboard-main">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium capitalize text-muted-foreground">
            {todayLabel}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            {t(greetingKey, { name: user.firstName ?? user.name })}
          </h1>
          {nextAbsence && (
            <Link
              href="/absences"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              <Plane className="size-3.5 text-primary" />
              {t("nextAbsence", {
                type: tAbs(nextAbsence.type),
                start: formatIsoDate(nextAbsence.startDate, locale),
                end: formatIsoDate(nextAbsence.endDate, locale),
              })}
            </Link>
          )}
        </div>
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
            {CARD_IDS.filter(id => id !== "approvals" || isManager).map(id => (
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
        className="mb-6 flex flex-wrap items-center gap-2"
        data-tour="tour-dashboard-actions"
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/absences?new=1">
            <Plus className="mr-1.5 size-3.5" />
            {t("actionRequestAbsence")}
          </Link>
        </Button>
        {isManager && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/calendar?new=1">
                <CalendarPlus className="mr-1.5 size-3.5" />
                {t("actionNewEvent")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/announcements?new=1">
                <Megaphone className="mr-1.5 size-3.5" />
                {t("actionNewAnnouncement")}
              </Link>
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href="/files">
            <Upload className="mr-1.5 size-3.5" />
            {t("actionUpload")}
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
            {todaysEvents.map(e => (
              <Link
                key={e._id}
                href="/calendar"
                className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {!e.allDay && (
                  <span className="tabular-nums opacity-75">
                    {formatTime(e.start, locale)}
                  </span>
                )}
                {e.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          "grid gap-4 md:grid-cols-2",
          "[&>*]:opacity-0 [&>*]:animate-[fadeInUp_0.5s_ease-out_forwards]"
        )}
      >
        {showCard("events") && (
          <div style={{ animationDelay: "0.05s" }}>
            <DashCard
              icon={<CalendarDays />}
              title={t("upcomingEvents")}
              count={events?.length}
            >
              {events === undefined ? (
                <RowSkeletons />
              ) : events.length === 0 ? (
                <Empty href="/calendar" linkLabel={t("openCalendar")}>
                  {t("noEvents")}
                </Empty>
              ) : (
                events
                  .slice(0, 5)
                  .map(e => (
                    <Row
                      key={e._id}
                      href="/calendar"
                      title={e.title}
                      subtitle={e.location}
                      leading={
                        e.location ? (
                          <MapPin className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
                        )
                      }
                      trailing={
                        <span className="whitespace-nowrap">
                          {formatDateTime(e.start, locale)}
                        </span>
                      }
                    />
                  ))
              )}
            </DashCard>
          </div>
        )}

        {showCard("announcements") && (
          <div style={{ animationDelay: "0.1s" }}>
            <DashCard icon={<Megaphone />} title={t("latestAnnouncements")}>
              {announcements === undefined ? (
                <RowSkeletons />
              ) : announcements.length === 0 ? (
                <Empty href="/announcements" linkLabel={t("openAnnouncements")}>
                  {t("noAnnouncements")}
                </Empty>
              ) : (
                announcements.slice(0, 5).map(a => (
                  <Row
                    key={a._id}
                    href="/announcements"
                    title={a.title}
                    subtitle={htmlToText(a.body) || undefined}
                    leading={
                      <Avatar className="size-8 shrink-0">
                        {a.authorAvatar && (
                          <AvatarImage
                            src={a.authorAvatar}
                            alt={a.authorName}
                          />
                        )}
                        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                          {initials(a.authorName, a.authorName)}
                        </AvatarFallback>
                      </Avatar>
                    }
                    trailing={
                      <>
                        <span className="whitespace-nowrap">
                          {relativeTime(a.publishedAt)}
                        </span>
                        {!a.read && (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </>
                    }
                  />
                ))
              )}
            </DashCard>
          </div>
        )}

        {showCard("chats") && (
          <div style={{ animationDelay: "0.15s" }}>
            <DashCard
              icon={<MessageSquare />}
              title={t("unreadChats")}
              count={unreadChats.length || undefined}
            >
              {conversations === undefined ? (
                <RowSkeletons />
              ) : unreadChats.length === 0 ? (
                <Empty href="/chat" linkLabel={t("openChat")}>
                  {t("noUnread")}
                </Empty>
              ) : (
                unreadChats.slice(0, 5).map(c => (
                  <Row
                    key={c._id}
                    href={`/chat?c=${c._id}`}
                    title={c.title}
                    subtitle={c.lastMessagePreview}
                    leading={
                      <Avatar className="size-8 shrink-0">
                        {c.avatar && (
                          <AvatarImage src={c.avatar} alt={c.title} />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {initials(c.title)}
                        </AvatarFallback>
                      </Avatar>
                    }
                    trailing={
                      <>
                        {c.lastMessageAt && (
                          <span className="whitespace-nowrap">
                            {relativeTime(c.lastMessageAt)}
                          </span>
                        )}
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                          {c.unread}
                        </span>
                      </>
                    }
                  />
                ))
              )}
            </DashCard>
          </div>
        )}

        {showCard("whosout") && (
          <div style={{ animationDelay: "0.2s" }}>
            <DashCard
              icon={<Plane />}
              title={t("whosOutToday")}
              count={outToday?.length || undefined}
            >
              {outToday === undefined ? (
                <RowSkeletons />
              ) : outToday.length === 0 ? (
                <Empty href="/calendar" linkLabel={t("openCalendar")}>
                  {t("nobodyOut")}
                </Empty>
              ) : (
                outToday.slice(0, 5).map(a => (
                  <Row
                    key={a._id}
                    href="/calendar"
                    title={a.userName}
                    subtitle={tAbs(a.type)}
                    leading={
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                          {initials(a.userName)}
                        </AvatarFallback>
                      </Avatar>
                    }
                    trailing={
                      <span className="whitespace-nowrap">
                        {t("outUntil", {
                          date: formatIsoDate(a.endDate, locale),
                        })}
                      </span>
                    }
                  />
                ))
              )}
            </DashCard>
          </div>
        )}

        {isManager && showCard("approvals") && (
          <div style={{ animationDelay: "0.25s" }}>
            <DashCard
              icon={<Plane />}
              title={t("pendingApprovals")}
              count={pending?.length || undefined}
            >
              {pending === undefined ? (
                <RowSkeletons />
              ) : pending.length === 0 ? (
                <Empty href="/absences" linkLabel={t("openAbsences")}>
                  {t("noApprovals")}
                </Empty>
              ) : (
                pending.slice(0, 5).map(a => (
                  <Row
                    key={a._id}
                    href="/absences"
                    title={a.userName}
                    subtitle={`${tAbs(a.type)} · ${formatIsoDate(a.startDate, locale)}`}
                    leading={
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                          {initials(a.userName)}
                        </AvatarFallback>
                      </Avatar>
                    }
                    trailing={
                      <span
                        className="flex items-center gap-1"
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tAbs("deny")}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void decide(a._id, "deny")}
                        >
                          <X />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tAbs("approve")}
                          className="text-success hover:bg-success/10 hover:text-success"
                          onClick={() => void decide(a._id, "approve")}
                        >
                          <Check />
                        </Button>
                      </span>
                    }
                  />
                ))
              )}
            </DashCard>
          </div>
        )}
      </div>
    </div>
  );
}
