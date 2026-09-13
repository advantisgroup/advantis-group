"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  KeyRound,
  Pin,
  Plane,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useHasCapability, useIsManager } from "@/components/providers/current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { isoToday } from "@/lib/absences";
import { usePendingApprovals } from "@/lib/absences-api";
import { formatIsoDate, formatTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const VISIBLE_ITEMS = 6;

interface Item {
  key: string;
  icon: ReactNode;
  title: string;
  meta: string;
  href: string;
  urgent: boolean;
  at: number;
}

function NeedsYouRow({ item }: { item: Item }) {
  return (
    <li>
      <Link
        href={item.href}
        data-shortcut-item
        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
          {item.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span
            className={cn(
              "block truncate text-xs",
              item.urgent ? "text-warning" : "text-muted-foreground",
            )}
          >
            {item.meta}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

export function NeedsYouPanel() {
  const t = useTranslations("Dashboard");
  const tAbsences = useTranslations("Absences");
  const locale = useLocale();
  const isManager = useIsManager();
  const canManageClockodo = useHasCapability("manage_clockodo_team");
  const approvalCover = useQuery(api.approvalDelegations.mine);
  const canReviewAbsences = canManageClockodo || (approvalCover?.length ?? 0) > 0;
  const { approvals } = usePendingApprovals(canReviewAbsences);
  const accessRequests = useQuery(
    api.accessRequests.list,
    isManager ? { status: "pending" } : "skip",
  );
  const tickets = useQuery(api.itTickets.listAssignedOpen);
  const measures = useQuery(api.errorMeasures.listMineOpen);
  const announcements = useQuery(api.announcements.needsAttention);

  const loading =
    tickets === undefined ||
    measures === undefined ||
    announcements === undefined ||
    (isManager && accessRequests === undefined);

  const items = useMemo(() => {
    const now = Date.now();
    const today = isoToday();
    const list: Item[] = [];
    if (canReviewAbsences) {
      for (const a of approvals ?? []) {
        const startsIn = Math.round(
          (new Date(`${a.startDate}T00:00:00`).getTime() -
            new Date(`${today}T00:00:00`).getTime()) /
            DAY_MS,
        );
        list.push({
          key: `absence-${a.id}`,
          icon: <Plane />,
          title: t("needsYouAbsence", { name: a.userName, type: tAbsences(a.type) }),
          meta: `${formatIsoDate(a.startDate, locale)} – ${formatIsoDate(a.endDate, locale)}`,
          href: "/approvals",
          urgent: startsIn <= 3,
          at: new Date(`${a.startDate}T00:00:00`).getTime(),
        });
      }
    }
    for (const r of accessRequests ?? []) {
      list.push({
        key: `access-${r._id}`,
        icon: <KeyRound />,
        title: t("needsYouAccess", { name: r.name ?? r.email }),
        meta: relativeTime(r.createdAt),
        href: "/admin/requests",
        urgent: now - r.createdAt > DAY_MS,
        at: r.createdAt,
      });
    }
    for (const ticket of tickets ?? []) {
      list.push({
        key: `ticket-${ticket._id}`,
        icon: <Wrench />,
        title: `#${String(ticket.nr).padStart(3, "0")} ${ticket.topic?.trim() || ticket.category}`,
        meta: t("needsYouTicket", {
          name: ticket.createdByName,
          when: relativeTime(ticket.createdAt),
        }),
        href: `/it-tickets?ticket=${ticket._id}`,
        urgent: ticket.status === "offen" && now - ticket.createdAt > DAY_MS,
        at: ticket.createdAt,
      });
    }
    for (const m of measures ?? []) {
      const overdue = m.dueAt !== null && m.dueAt < now;
      list.push({
        key: `measure-${m._id}`,
        icon: <ClipboardCheck />,
        title: m.description,
        meta: m.dueAt
          ? t(overdue ? "needsYouMeasureOverdue" : "needsYouMeasureDue", {
              date: new Date(m.dueAt).toLocaleDateString(locale),
            })
          : t("needsYouMeasure"),
        href: `/fehlermanagement?open=${m.errorReportId}`,
        urgent: overdue,
        at: m.dueAt ?? Number.MAX_SAFE_INTEGER,
      });
    }
    for (const a of announcements ?? []) {
      list.push({
        key: `announcement-${a._id}`,
        icon: <Pin />,
        title: a.title,
        meta: t(a.requiresAck ? "needsYouAck" : "needsYouPinned"),
        href: `/announcements?id=${a._id}`,
        urgent: a.requiresAck,
        at: a.publishedAt,
      });
    }
    return list.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.at - b.at);
  }, [
    accessRequests,
    announcements,
    approvals,
    canReviewAbsences,
    locale,
    measures,
    t,
    tAbsences,
    tickets,
  ]);

  const hidden = items.length - VISIBLE_ITEMS;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-2">
      <div className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-2">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {t("needsYouTitle")}
          {items.length > 0 && (
            <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
              {items.length}
            </span>
          )}
        </h2>
        {canReviewAbsences || isManager ? (
          <Link
            href="/approvals"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {t("needsYouApprovals")}
          </Link>
        ) : null}
      </div>
      {loading ? (
        <div className="space-y-1.5 p-3">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" />
          {t("needsYouEmpty")}
        </p>
      ) : (
        <>
          <ul>
            {items.slice(0, VISIBLE_ITEMS).map((item) => (
              <NeedsYouRow key={item.key} item={item} />
            ))}
          </ul>
          {hidden > 0 && (
            <p className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
              {t("needsYouMore", { count: hidden })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function TodayPanel({
  events,
}: {
  events: { _id: string; title: string; start: number; allDay?: boolean }[];
}) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-2">
      <div className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{t("todaysSchedule")}</h2>
        <Link
          href="/calendar"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {t("todayOpenCalendar")}
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {t("todayNothing")}
        </p>
      ) : (
        <ul>
          {events.map((e) => (
            <li key={e._id}>
              <Link
                href="/calendar"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
              >
                <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {e.allDay ? t("todayAllDay") : formatTime(e.start, locale)}
                </span>
                <span className="h-4 w-0.5 shrink-0 rounded-full bg-primary/60" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
