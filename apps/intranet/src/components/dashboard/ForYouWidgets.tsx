"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  Award,
  Circle,
  Clock,
  Coffee,
  LogOut,
  MessageSquare,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatIsoDate, formatTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DashCard, Empty, Row, RowSkeletons, StatLine } from "./primitives";
import { todayLocalDay } from "@/lib/activity/fmt";
import { useMemo } from "react";

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

/** The caller's own fused Clockodo/ActivityTrack status — self-data, not
 * team surveillance, so it's visible to every employee. */
export function MyDayCard() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();

  const today = todayLocalDay();

  const dayStart = useMemo(() => new Date(`${today}T00:00:00`).getTime(), [today]);

  const statesRaw = useQuery(api.activity.state.stateBatch, {
    since: dayStart,
  });

  const states = useMemo(() => {
    if (!statesRaw) return [];

    return statesRaw.map((v) => {
      if (!v?.state) return null;

      const base = {
        finalState: v.state.finalState,
        finalStateSince: v.state.finalStateSince,
      };

      if (v.state.clockodoWorking) {
        return {
          ...base,
          key: "clockodoWorking",
          icon: Circle,
          tint: "text-success",
        };
      }

      if (v.state.clockodoBreak) {
        return {
          ...base,
          key: "clockodoBreak",
          icon: Coffee,
          tint: "text-warning",
        };
      }

      if (v.state.clockodoAbsent) {
        return {
          ...base,
          key: "clockodoAbsent",
          icon: LogOut,
          tint: "text-muted-foreground",
        };
      }

      if (v.state.clockodoClockedOut) {
        return {
          ...base,
          key: "clockodoClockedOut",
          icon: LogOut,
          tint: "text-muted-foreground",
        };
      }

      return {
        ...base,
        key: "active",
        icon: Circle,
        tint: "text-success",
      };
    });
  }, [statesRaw]);

  return (
    <DashCard icon={<Clock />} title={t("yourDayTitle")}>
      {statesRaw === null ? (
        <RowSkeletons />
      ) : statesRaw === undefined || states.length === 0 ? (
        <Empty href="/settings" linkLabel={t("openSettings")}>
          {t("clockodoNotLinked")}
        </Empty>
      ) : (
        states.map((status) => {
          if (!status) return null;

          const StatusIcon = status.icon;

          return (
            <StatLine
              key={status.finalState}
              icon={<StatusIcon className={status.tint} />}
              label={t(status.key)}
              value={
                status.finalStateSince
                  ? t("sinceTime", {
                      time: formatTime(status.finalStateSince, locale),
                    })
                  : ""
              }
            />
          );
        })
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
  const mine = useQuery(api.itTickets.listMineOpen, { limit: 5 });

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
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                {ticket.nr}
              </span>
            }
            trailing={
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  ticket.status === "offen"
                    ? "bg-warning/15 text-warning"
                    : "bg-primary/10 text-primary",
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

/** Personal performance snapshot — only rendered for users with a linked
 * Performance account (sales team); the parent decides whether to mount it. */
export function MyPerformanceCard() {
  const t = useTranslations("Dashboard");
  const { session } = usePerformanceSession();
  const employeeId = session?.valid ? session.employeeId : null;
  const detail = useQuery(
    api.performanceQueries.employeeDetail,
    employeeId ? { token: "", employeeId } : "skip",
  );

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
