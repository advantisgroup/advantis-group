"use client";

import { useQuery } from "convex/react";
import { CalendarDays, Megaphone, MessageSquare, Plane } from "lucide-react";

import { api } from "@advantis/convex/api";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatIsoDate } from "@/lib/format";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const user = useCurrentUser();
  const isManager = useIsManager();

  const now = Date.now();
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

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">
        {t("greeting", { name: user.firstName ?? user.name })}
      </h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CalendarDays className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("upcomingEvents")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {events === undefined ? null : events.length === 0 ? (
              <p className="text-muted-foreground">{t("noEvents")}</p>
            ) : (
              events.slice(0, 5).map(e => (
                <Link
                  key={e._id}
                  href="/calendar"
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="truncate font-medium">{e.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(e.start, locale)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Megaphone className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">
              {t("latestAnnouncements")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {announcements === undefined ? null : announcements.length === 0 ? (
              <p className="text-muted-foreground">{t("noAnnouncements")}</p>
            ) : (
              announcements.slice(0, 5).map(a => (
                <Link
                  key={a._id}
                  href="/announcements"
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="truncate font-medium">{a.title}</span>
                  {!a.read && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("unreadChats")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {conversations === undefined ? null : unreadChats.length === 0 ? (
              <p className="text-muted-foreground">{t("noUnread")}</p>
            ) : (
              unreadChats.slice(0, 5).map(c => (
                <Link
                  key={c._id}
                  href="/chat"
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="truncate font-medium">{c.title}</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {c.unread}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {isManager && (
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Plane className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">
                {t("pendingApprovals")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pending === undefined ? null : pending.length === 0 ? (
                <p className="text-muted-foreground">{t("noApprovals")}</p>
              ) : (
                pending.slice(0, 5).map(a => (
                  <Link
                    key={a._id}
                    href="/absences"
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="truncate font-medium">{a.userName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatIsoDate(a.startDate, locale)}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
