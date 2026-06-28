"use client";

import type { ReactNode } from "react";

import { useQuery } from "convex/react";
import {
  CalendarDays,
  MapPin,
  Megaphone,
  MessageSquare,
  Plane,
} from "lucide-react";

import { api } from "@advantis/convex/api";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { htmlToText } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatIsoDate,
  initials,
  relativeTime,
} from "@/lib/format";

const now = Date.now();

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

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
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
  const events = useQuery(api.events.listForRange, {
    start: now,
    end: now + 30 * 24 * 60 * 60 * 1000,
  });
  const announcements = useQuery(api.announcements.list, { limit: 5 });
  const conversations = useQuery(api.chat.listConversations);
  const pending = useQuery(
    api.absences.pendingForApproval,
    isManager ? {} : "skip"
  );

  const unreadChats = conversations?.filter(c => c.unread > 0) ?? [];
  const today = new Date(now).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-sm font-medium capitalize text-muted-foreground">
          {today}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
          {t("greeting", { name: user.firstName ?? user.name })}
        </h1>
      </div>

      <div
        className={cn(
          "grid gap-4 md:grid-cols-2",
          "[&>*]:opacity-0 [&>*]:animate-[fadeInUp_0.5s_ease-out_forwards]"
        )}
      >
        <div style={{ animationDelay: "0.05s" }}>
          <DashCard
            icon={<CalendarDays />}
            title={t("upcomingEvents")}
            count={events?.length}
          >
            {events === undefined ? null : events.length === 0 ? (
              <Empty>{t("noEvents")}</Empty>
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

        <div style={{ animationDelay: "0.1s" }}>
          <DashCard icon={<Megaphone />} title={t("latestAnnouncements")}>
            {announcements === undefined ? null : announcements.length === 0 ? (
              <Empty>{t("noAnnouncements")}</Empty>
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
                        <AvatarImage src={a.authorAvatar} alt={a.authorName} />
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

        <div style={{ animationDelay: "0.15s" }}>
          <DashCard
            icon={<MessageSquare />}
            title={t("unreadChats")}
            count={unreadChats.length || undefined}
          >
            {conversations === undefined ? null : unreadChats.length === 0 ? (
              <Empty>{t("noUnread")}</Empty>
            ) : (
              unreadChats.slice(0, 5).map(c => (
                <Row
                  key={c._id}
                  href={`/chat?c=${c._id}`}
                  title={c.title}
                  subtitle={c.lastMessagePreview}
                  leading={
                    <Avatar className="size-8 shrink-0">
                      {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
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

        {isManager && (
          <div style={{ animationDelay: "0.2s" }}>
            <DashCard
              icon={<Plane />}
              title={t("pendingApprovals")}
              count={pending?.length || undefined}
            >
              {pending === undefined ? null : pending.length === 0 ? (
                <Empty>{t("noApprovals")}</Empty>
              ) : (
                pending.slice(0, 5).map(a => (
                  <Row
                    key={a._id}
                    href="/absences"
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
                        {formatIsoDate(a.startDate, locale)}
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
