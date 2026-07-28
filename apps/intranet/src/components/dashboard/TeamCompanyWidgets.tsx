"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { CalendarDays, MapPin, Megaphone, PartyPopper, Plane } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { htmlToText } from "@/components/ui/rich-text";
import { isoToday } from "@/lib/absences";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { formatDateTime, formatIsoDate, initials, relativeTime } from "@/lib/format";

import { DashCard, Empty, Row, RowSkeletons } from "./primitives";

const now = Date.now();
const startOfToday = new Date(now).setHours(0, 0, 0, 0);

export function EventsCard() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const events = useQuery(api.events.listForRange, {
    start: startOfToday,
    end: now + 30 * 24 * 60 * 60 * 1000,
  });

  return (
    <DashCard icon={<CalendarDays />} title={t("upcomingEvents")} count={events?.length}>
      {events === undefined ? (
        <RowSkeletons />
      ) : events.length === 0 ? (
        <Empty href="/calendar" linkLabel={t("openCalendar")}>
          {t("noEvents")}
        </Empty>
      ) : (
        events
          .slice(0, 5)
          .map((e) => (
            <Row
              key={e._id}
              href={`/calendar?event=${e._id}`}
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
                <span className="whitespace-nowrap">{formatDateTime(e.start, locale)}</span>
              }
            />
          ))
      )}
    </DashCard>
  );
}

export function AnnouncementsCard() {
  const t = useTranslations("Dashboard");
  const announcements = useQuery(api.announcements.list, { limit: 5 });

  return (
    <DashCard icon={<Megaphone />} title={t("latestAnnouncements")}>
      {announcements === undefined ? (
        <RowSkeletons />
      ) : announcements.length === 0 ? (
        <Empty href="/announcements" linkLabel={t("openAnnouncements")}>
          {t("noAnnouncements")}
        </Empty>
      ) : (
        announcements.slice(0, 5).map((a) => (
          <Row
            key={a._id}
            href={`/announcements?id=${a._id}`}
            title={a.title}
            subtitle={htmlToText(a.body) || undefined}
            leading={
              <Avatar className="size-8 shrink-0">
                {a.authorAvatar && <AvatarImage src={a.authorAvatar} alt={a.authorName} />}
                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                  {initials(a.authorName, a.authorName)}
                </AvatarFallback>
              </Avatar>
            }
            trailing={
              <>
                <span className="whitespace-nowrap">{relativeTime(a.publishedAt)}</span>
                {!a.read && <span className="h-2 w-2 rounded-full bg-primary" />}
              </>
            }
          />
        ))
      )}
    </DashCard>
  );
}

export function WhosOutCard() {
  const t = useTranslations("Dashboard");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const today = isoToday();
  const outToday = useAbsencesCalendar(today, today);

  return (
    <DashCard icon={<Plane />} title={t("whosOutToday")} count={outToday?.length || undefined}>
      {outToday === undefined ? (
        <RowSkeletons />
      ) : outToday.length === 0 ? (
        <Empty href="/calendar" linkLabel={t("openCalendar")}>
          {t("nobodyOut")}
        </Empty>
      ) : (
        outToday.slice(0, 5).map((a) => (
          <Row
            key={a.id}
            href={`/calendar?absence=${a.id}`}
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
                {t("outUntil", { date: formatIsoDate(a.endDate, locale) })}
              </span>
            }
          />
        ))
      )}
    </DashCard>
  );
}

/** Today's birthdays (opt-in only) and work anniversaries, org-wide. */
export function CelebrationsCard() {
  const t = useTranslations("Dashboard");
  const celebrations = useQuery(api.users.todaysCelebrations);

  return (
    <DashCard icon={<PartyPopper />} title={t("celebrationsTitle")}>
      {celebrations === undefined ? (
        <RowSkeletons />
      ) : celebrations.length === 0 ? (
        <Empty>{t("celebrationsEmpty")}</Empty>
      ) : (
        celebrations.map((c) => (
          <Row
            key={`${c.userId}-${c.type}`}
            href={`/directory?user=${c.userId}`}
            title={c.name}
            subtitle={
              c.type === "birthday"
                ? t("birthdayLabel")
                : t("anniversaryLabel", { years: c.years ?? 0 })
            }
            leading={
              <Avatar className="size-8 shrink-0">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.name} />}
                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                  {initials(c.name)}
                </AvatarFallback>
              </Avatar>
            }
          />
        ))
      )}
    </DashCard>
  );
}
