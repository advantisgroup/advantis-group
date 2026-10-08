"use client";

import { useMemo, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { AlarmClock, Bell, Check, ChevronDown, Mail, MailOpen, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { Button } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { useNow } from "@/hooks/use-now";
import { useSave } from "@/hooks/use-save";
import { formatDateTime, relativeTime } from "@/lib/format";
import { bucketFor, notificationHref, notificationVisual } from "@/lib/notification-kinds";
import { cn } from "@/lib/utils";

type Category = "absence" | "announcement" | "uploads" | "chat" | "system";

const CATEGORIES: Category[] = ["chat", "absence", "announcement", "uploads", "system"];

function categoryOf(type: string): Category {
  if (type.startsWith("absence")) return "absence";
  if (type === "announcement") return "announcement";
  if (type.startsWith("upload")) return "uploads";
  if (type.startsWith("chat")) return "chat";
  return "system";
}

/** Read items older than this collapse behind a "show older" toggle. */
const OLD_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const ACTION_REQUIRED_TYPES = new Set([
  "absence_request",
  "upload_request",
  "access_request",
  "academy_answer",
  "password_reset_request",
  "system_alert",
]);

interface NotificationDoc {
  _id: Id<"notifications">;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: number;
  createdAt: number;
}

function needsDecision(notification: NotificationDoc): boolean {
  return !notification.readAt && ACTION_REQUIRED_TYPES.has(notification.type);
}

export default function NotificationsPage() {
  const t = useTranslations("Notifications");

  const notifications = useQuery(api.notifications.notifications.list, { limit: 100 });
  const markAllRead = useSave(api.notifications.notifications.markAllRead);

  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [types, setTypes] = useState<Category[]>([]);
  const [showOld, setShowOld] = useState(false);

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  const filtered = useMemo(
    () =>
      (notifications ?? [])
        .filter((n) => (tab === "unread" ? !n.readAt : true))
        .filter((n) => types.length === 0 || types.includes(categoryOf(n.type))),
    [notifications, tab, types],
  );

  const now = useNow(true, 30_000);
  const oldCount = filtered.filter((n) => n.readAt && now - n.createdAt > OLD_AFTER_MS).length;
  const visible =
    showOld || tab === "unread"
      ? filtered
      : filtered.filter((n) => !n.readAt || now - n.createdAt <= OLD_AFTER_MS);

  const sections = useMemo(() => {
    const actionRequired: NotificationDoc[] = [];
    const today: NotificationDoc[] = [];
    const earlier: NotificationDoc[] = [];

    for (const notification of visible) {
      if (needsDecision(notification)) actionRequired.push(notification);
      else if (bucketFor(notification.createdAt, now) === "today") today.push(notification);
      else earlier.push(notification);
    }

    return [
      { key: "actionRequired", label: t("needsDecision"), rows: actionRequired },
      { key: "today", label: t("today"), rows: today },
      { key: "earlier", label: t("earlier"), rows: earlier },
    ];
  }, [now, t, visible]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeaderBar
        title={t("title")}
        description={t("subtitle")}
        icon={<Bell />}
        tourCheckpoint="notifications"
      />
      <PageHeaderActions
        actions={
          unreadCount > 0
            ? [
                {
                  key: "mark-all-read",
                  label: t("markAllRead"),
                  icon: Check,
                  onClick: () => void markAllRead({}),
                  variant: "outline",
                },
              ]
            : []
        }
      />

      <div className="space-y-3">
        <CountTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "unread", label: t("unread"), count: unreadCount },
            { value: "all", label: t("all"), count: notifications?.length },
          ]}
        />
        <FilterPill
          label={t("typeFilter")}
          options={CATEGORIES.map((key) => ({
            value: key,
            label: t(`cat_${key}`),
            count: (notifications ?? []).filter((n) => categoryOf(n.type) === key).length,
          }))}
          selected={types}
          onChange={(next) => setTypes(next as Category[])}
          clearLabel={t("clearFilter", { label: t("typeFilter") })}
        />
      </div>

      {/* Important unread decisions stay ahead of reference notifications. */}
      <div data-tour="tour-notifications-feed" className="space-y-6">
        {sections.every((section) => section.rows.length === 0) ? (
          <EmptyState icon={<Bell />} title={t("allCaughtUp")} description={t("empty")} />
        ) : (
          sections.map(
            (section) =>
              section.rows.length > 0 && (
                <div key={section.key} className="space-y-2">
                  <p
                    className={cn(
                      "px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      section.key === "actionRequired" && "text-warning",
                    )}
                  >
                    {section.label}
                    <span className="ml-1.5 tabular-nums text-muted-foreground">
                      {section.rows.length}
                    </span>
                  </p>
                  <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
                    {section.rows.map((n) => (
                      <NotificationRow key={n._id} n={n} />
                    ))}
                  </div>
                </div>
              ),
          )
        )}
        {tab === "all" && !showOld && oldCount > 0 && (
          <button
            type="button"
            onClick={() => setShowOld(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="size-3.5" />
            {t("showOlder", { count: oldCount })}
          </button>
        )}
      </div>

      <section
        data-tour="tour-notifications-prefs"
        className="space-y-5 border-t border-border/70 pt-8"
      >
        <div>
          <h2 className="text-base font-semibold tracking-tight">{t("preferences")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("preferencesHint")}</p>
        </div>
        <NotificationPreferences />
      </section>
    </div>
  );
}

function NotificationRow({ n }: { n: NotificationDoc }) {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const markRead = useSave(api.notifications.notifications.markRead);
  const markUnread = useSave(api.notifications.notifications.markUnread);
  const remove = useSave(api.notifications.notifications.remove);
  const snooze = useSave(api.notifications.notifications.snooze);
  // Icon/tint come from the shared registry, so a row looks the same here
  // as in the header menu. The coarse category is only for the filter chips.
  const { icon: Icon, tint } = notificationVisual(n.type);

  function open() {
    if (!n.readAt) void markRead({ notificationId: n._id });
    if (n.link) router.push(notificationHref(n.link, pathname));
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50",
        !n.readAt && "bg-primary/5",
      )}
    >
      <button onClick={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            n.readAt ? "bg-muted text-muted-foreground" : tint,
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-sm", n.readAt ? "font-medium" : "font-semibold")}>
              {n.title}
            </span>
            {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-primary" />}
          </span>
          {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {relativeTime(n.createdAt)}
          </span>
        </span>
      </button>
      {/* Row actions: hover-revealed on desktop, always visible on touch. */}
      <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={n.readAt ? t("markUnread") : t("markReadAction")}
          className="text-muted-foreground"
          onClick={() =>
            n.readAt
              ? void markUnread({ notificationId: n._id })
              : void markRead({ notificationId: n._id })
          }
        >
          {n.readAt ? <Mail /> : <MailOpen />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("snooze")}
              className="text-muted-foreground"
            >
              <AlarmClock />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(
              [
                ["snoozeHour", () => Date.now() + 60 * 60 * 1000],
                ["snoozeAfternoon", () => new Date().setHours(14, 0, 0, 0)],
                [
                  "snoozeTomorrow",
                  () => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    return d.setHours(9, 0, 0, 0);
                  },
                ],
                [
                  "snoozeNextWeek",
                  () => {
                    const d = new Date();
                    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
                    return d.setHours(9, 0, 0, 0);
                  },
                ],
              ] as const
            )
              .filter(([key]) => key !== "snoozeAfternoon" || new Date().getHours() < 13)
              .map(([key, until]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => {
                    const at = until();
                    void snooze(
                      { notificationId: n._id, until: at },
                      { success: t("snoozedToast", { when: formatDateTime(at, locale) }) },
                    );
                  }}
                >
                  {t(key)}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("dismiss")}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => void remove({ notificationId: n._id })}
        >
          <Trash2 />
        </Button>
      </span>
    </div>
  );
}
