"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  Check,
  ChevronDown,
  Mail,
  MailOpen,
  Megaphone,
  Plane,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Category = "absence" | "announcement" | "uploads" | "system";

const CATEGORY_ICON: Record<Category, typeof Bell> = {
  absence: Plane,
  announcement: Megaphone,
  uploads: UploadCloud,
  system: ShieldCheck,
};

const CATEGORY_TINT: Record<Category, string> = {
  absence: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  announcement: "bg-primary/10 text-primary",
  uploads: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  system: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
};

function categoryOf(type: string): Category {
  if (type.startsWith("absence")) return "absence";
  if (type === "announcement") return "announcement";
  if (type.startsWith("upload")) return "uploads";
  return "system";
}

/** Read items older than this collapse behind a "show older" toggle. */
const OLD_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

interface NotificationDoc {
  _id: Id<"notifications">;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: number;
  createdAt: number;
}

export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const locale = useLocale();

  const notifications = useQuery(api.notifications.list, { limit: 100 });
  const markAllRead = useMutation(api.notifications.markAllRead);

  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [showOld, setShowOld] = useState(false);

  const unreadCount = notifications?.filter(n => !n.readAt).length ?? 0;

  const filtered = useMemo(
    () =>
      (notifications ?? [])
        .filter(n => (tab === "unread" ? !n.readAt : true))
        .filter(n => (filter === "all" ? true : categoryOf(n.type) === filter)),
    [notifications, tab, filter]
  );

  const now = Date.now();
  const oldCount = filtered.filter(
    n => n.readAt && now - n.createdAt > OLD_AFTER_MS
  ).length;
  const visible =
    showOld || tab === "unread"
      ? filtered
      : filtered.filter(n => !n.readAt || now - n.createdAt <= OLD_AFTER_MS);

  // Group by calendar day, newest day first (list is already newest-first).
  const byDay = useMemo(() => {
    const groups = new Map<string, NotificationDoc[]>();
    for (const n of visible) {
      const key = new Date(n.createdAt).toDateString();
      const list = groups.get(key) ?? [];
      list.push(n);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [visible]);

  function dayLabel(key: string): string {
    const date = new Date(key);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    if (date.toDateString() === today.toDateString()) return t("today");
    if (date.toDateString() === yesterday.toDateString()) return t("yesterday");
    return date.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={t("title")}
        title={t("title")}
        description={t("subtitle")}
        icon={<Bell />}
        tourCheckpoint="notifications"
        action={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={() => void markAllRead({})}>
              <Check className="mr-2 size-4" />
              {t("markAllRead")}
            </Button>
          ) : undefined
        }
      />

      {/* Tabs + type filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { key: "unread", label: t("unread") },
              { key: "all", label: t("all") },
            ] as const
          ).map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setTab(s.key)}
              aria-pressed={tab === s.key}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                tab === s.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {s.label}
              {s.key === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 tabular-nums">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { key: "all", label: t("all") },
              { key: "absence", label: t("cat_absence") },
              { key: "announcement", label: t("cat_announcement") },
              { key: "uploads", label: t("cat_uploads") },
              { key: "system", label: t("cat_system") },
            ] as const
          ).map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed grouped by day */}
      <div data-tour="tour-notifications-feed" className="space-y-6">
        {byDay.length === 0 ? (
          <EmptyState
            icon={<Bell />}
            title={t("allCaughtUp")}
            description={t("empty")}
          />
        ) : (
          byDay.map(([day, rows]) => (
            <div key={day} className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {dayLabel(day)}
              </p>
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
                {rows.map(n => (
                  <NotificationRow key={n._id} n={n} />
                ))}
              </div>
            </div>
          ))
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

      {/* Preferences */}
      <Card data-tour="tour-notifications-prefs">
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-semibold tracking-tight">{t("preferences")}</p>
            <p className="text-sm text-muted-foreground">
              {t("preferencesHint")}
            </p>
          </div>
          <NotificationPreferences />
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationRow({ n }: { n: NotificationDoc }) {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const markRead = useMutation(api.notifications.markRead);
  const markUnread = useMutation(api.notifications.markUnread);
  const remove = useMutation(api.notifications.remove);
  const cat = categoryOf(n.type);
  const Icon = CATEGORY_ICON[cat];

  function open() {
    if (!n.readAt) void markRead({ notificationId: n._id });
    if (n.link) router.push(n.link);
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50",
        !n.readAt && "bg-primary/5"
      )}
    >
      <button
        onClick={open}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            n.readAt ? "bg-muted text-muted-foreground" : CATEGORY_TINT[cat]
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm",
                n.readAt ? "font-medium" : "font-semibold"
              )}
            >
              {n.title}
            </span>
            {!n.readAt && (
              <span className="size-2 shrink-0 rounded-full bg-primary" />
            )}
          </span>
          {n.body && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {n.body}
            </span>
          )}
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
