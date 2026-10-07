"use client";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import {
  Award,
  CalendarDays,
  CircleUserRound,
  MessageSquare,
  Plane,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { CurrentUser } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStartOfToday } from "@/hooks/use-today";
import { localIsoDate } from "@/lib/absences";
import { useMyAbsences } from "@/lib/absences-api";
import { formatDateTime, formatIsoDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DashCard, Empty, Row, RowSkeletons, StatLine } from "./primitives";
import { useMemo } from "react";

const PROFILE_FIELDS = ["avatar", "jobTitle", "phone"] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

export function missingProfileFields(user: CurrentUser): ProfileField[] {
  return PROFILE_FIELDS.filter((field) => {
    if (field === "avatar") return !user.avatar;
    return !user[field]?.trim();
  });
}

export function ProfileCompletionCard({ missingFields }: { missingFields: ProfileField[] }) {
  const t = useTranslations("Dashboard");

  return (
    <DashCard
      icon={<CircleUserRound />}
      title={t("profileCompletionTitle")}
      count={missingFields.length}
    >
      <Row
        href="/settings/account"
        title={t("profileCompletionAction")}
        subtitle={missingFields.map((field) => t(`profileField.${field}`)).join(", ")}
        leading={<CircleUserRound className="size-5 text-primary" />}
      />
    </DashCard>
  );
}

export function MyWeekCard() {
  const t = useTranslations("Dashboard");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const startOfToday = useStartOfToday();
  const period = useMemo(() => {
    const start = new Date(startOfToday);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return {
      start: start.getTime(),
      end: end.getTime(),
      startIso: localIsoDate(start),
      endIso: localIsoDate(end),
    };
  }, [startOfToday]);
  const events = useQuery(api.events.listForRange, { start: period.start, end: period.end });
  const { absences } = useMyAbsences();

  const items = useMemo(() => {
    const eventItems = (events ?? []).map((event) => ({
      id: `event-${event._id}`,
      href: `/calendar?event=${event._id}`,
      title: event.title,
      subtitle: event.location,
      time: event.start,
      type: "event" as const,
    }));
    const absenceItems = (absences ?? [])
      .filter(
        (absence) =>
          absence.status === "approved" &&
          absence.startDate <= period.endIso &&
          absence.endDate >= period.startIso,
      )
      .map((absence) => ({
        id: `absence-${absence.id}`,
        href: "/calendar",
        title: tAbs(absence.type),
        subtitle:
          absence.startDate === absence.endDate
            ? formatIsoDate(absence.startDate, locale)
            : `${formatIsoDate(absence.startDate, locale)} – ${formatIsoDate(absence.endDate, locale)}`,
        time: new Date(`${absence.startDate}T00:00:00`).getTime(),
        type: "absence" as const,
      }));

    return [...eventItems, ...absenceItems].sort((a, b) => a.time - b.time).slice(0, 5);
  }, [absences, events, locale, period.endIso, period.startIso, tAbs]);

  return (
    <DashCard icon={<CalendarDays />} title={t("myWeekTitle")} count={items.length || undefined}>
      {events === undefined || absences === undefined ? (
        <RowSkeletons />
      ) : items.length === 0 ? (
        <Empty href="/calendar" linkLabel={t("openCalendar")}>
          {t("myWeekEmpty")}
        </Empty>
      ) : (
        items.map((item) => (
          <Row
            key={item.id}
            href={item.href}
            title={item.title}
            subtitle={item.subtitle}
            leading={
              item.type === "event" ? (
                <CalendarDays className="size-4 shrink-0 text-primary" />
              ) : (
                <Plane className="size-4 shrink-0 text-sky-600 dark:text-sky-300" />
              )
            }
            trailing={
              item.type === "event" ? (
                <span className="whitespace-nowrap">{formatDateTime(item.time, locale)}</span>
              ) : undefined
            }
          />
        ))
      )}
    </DashCard>
  );
}

export function ChatsCard() {
  const t = useTranslations("Dashboard");
  const conversations = useQuery(api.chat.listConversations);
  const unreadChats = conversations?.filter((c) => c.unread > 0) ?? [];

  return (
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
        unreadChats.slice(0, 5).map((c) => (
          <Row
            key={c._id}
            href={`/chat?c=${c._id}`}
            title={c.title}
            subtitle={c.lastMessagePreview}
            leading={
              <Avatar className="size-8 shrink-0">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
                <AvatarFallback className="text-[10px]">{initials(c.title)}</AvatarFallback>
              </Avatar>
            }
            trailing={
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {c.unread}
              </span>
            }
          />
        ))
      )}
    </DashCard>
  );
}

/**
 * The caller's own still-open IT tickets. "For you" otherwise only covered
 * things arriving *at* the user (messages, their clock state) — this is the
 * one place showing work they started and are waiting on, which is what
 * people were opening /it-tickets to re-check.
 */
export function MyTicketsCard() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const mine = useQuery(api.itTickets.tickets.listMineOpen, { limit: 5 });

  return (
    <DashCard icon={<Wrench />} title={t("myTicketsTitle")} count={mine?.length || undefined}>
      {mine === undefined ? (
        <RowSkeletons />
      ) : mine.length === 0 ? (
        <Empty href="/it-tickets" linkLabel={t("openTickets")}>
          {t("noOpenTickets")}
        </Empty>
      ) : (
        mine.map((ticket) => (
          <Row
            key={ticket._id}
            href={`/it-tickets?ticket=${ticket._id}`}
            title={ticket.topic?.trim() || ticket.category}
            subtitle={formatIsoDate(ticket.date, locale)}
            leading={
              <span className="w-8 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {ticket.nr}
              </span>
            }
            trailing={
              <span
                className={cn(
                  "text-[11px] font-medium",
                  ticket.status === "offen" ? "text-warning" : "text-muted-foreground",
                )}
              >
                {t(`ticketStatus.${ticket.status}`)}
              </span>
            }
          />
        ))
      )}
    </DashCard>
  );
}

/** Personal performance snapshot — only rendered for people whose intranet
 * account is linked to a report name on a sales dashboard; the parent
 * decides. */
export function MyPerformanceCard({ employeeId }: { employeeId: Id<"performanceEmployees"> }) {
  const t = useTranslations("Dashboard");
  const detail = useQuery(api.performance.queries.employeeDetail, { employeeId });

  const topHighlight = detail?.highlights?.[0];

  return (
    <DashCard icon={<TrendingUp />} title={t("myPerformanceTitle")}>
      {detail === undefined ? (
        <RowSkeletons />
      ) : (
        <div className="space-y-1">
          {topHighlight && (
            <StatLine
              icon={<TrendingUp className="text-success" />}
              label={topHighlight.label}
              value={topHighlight.cmp}
            />
          )}
          {detail.nBadges > 0 && (
            <StatLine
              icon={<Award className="text-primary" />}
              label={t("badgesEarned")}
              value={detail.nBadges}
            />
          )}
          {!topHighlight && detail.nBadges === 0 && (
            <Empty href="/performance" linkLabel={t("openPerformance")}>
              {t("noPerformanceData")}
            </Empty>
          )}
        </div>
      )}
    </DashCard>
  );
}
