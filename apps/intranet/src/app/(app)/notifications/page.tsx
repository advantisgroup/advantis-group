"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  BellOff,
  Check,
  Megaphone,
  Plane,
  ShieldCheck,
} from "lucide-react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Category = "absence" | "announcement" | "system";

const CATEGORY_TYPES: Record<Category, string[]> = {
  absence: ["absence_request", "absence_decision"],
  announcement: ["announcement"],
  system: ["access_request"],
};

const CATEGORY_ICON: Record<Category, typeof Bell> = {
  absence: Plane,
  announcement: Megaphone,
  system: ShieldCheck,
};

const CATEGORY_TINT: Record<Category, string> = {
  absence: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  announcement: "bg-primary/10 text-primary",
  system: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
};

function categoryOf(type: string): Category {
  if (type.startsWith("absence")) return "absence";
  if (type === "announcement") return "announcement";
  return "system";
}

// Categories the user can opt out of (system notices aren't user-configurable).
const MUTABLE: Category[] = ["absence", "announcement"];

export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();

  const notifications = useQuery(api.notifications.list, { limit: 100 });
  const prefs = useQuery(api.notifications.getPreferences);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const setPreferences = useMutation(api.notifications.setPreferences);

  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [filter, setFilter] = useState<"all" | Category>("all");

  const muted = prefs?.mutedTypes ?? [];
  const unreadCount = notifications?.filter(n => !n.readAt).length ?? 0;

  const filtered = (notifications ?? [])
    .filter(n => (tab === "unread" ? !n.readAt : true))
    .filter(n => (filter === "all" ? true : categoryOf(n.type) === filter));

  const unread = filtered.filter(n => !n.readAt);
  const earlier = filtered.filter(n => n.readAt);

  function isMuted(cat: Category) {
    return CATEGORY_TYPES[cat].every(ty => muted.includes(ty));
  }

  function toggleMute(cat: Category) {
    const types = CATEGORY_TYPES[cat];
    const next = isMuted(cat)
      ? muted.filter(ty => !types.includes(ty))
      : [...new Set([...muted, ...types])];
    void setPreferences({ mutedTypes: next });
  }

  function open(n: {
    _id: Id<"notifications">;
    link?: string;
    readAt?: number;
  }) {
    if (!n.readAt) {
      void markRead({ notificationId: n._id });
    }
    if (n.link) router.push(n.link);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={t("title")}
        title={t("title")}
        description={t("subtitle")}
        icon={<Bell />}
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

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Bell className="size-6" />
            </span>
            <p className="text-sm font-medium">{t("allCaughtUp")}</p>
            <p className="text-xs text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {unread.length > 0 && (
            <Section title={t("unread")}>
              {unread.map(n => (
                <NotificationRow
                  key={n._id}
                  n={n}
                  locale={locale}
                  onOpen={() => open(n)}
                />
              ))}
            </Section>
          )}
          {tab === "all" && earlier.length > 0 && (
            <Section title={t("earlier")}>
              {earlier.map(n => (
                <NotificationRow
                  key={n._id}
                  n={n}
                  locale={locale}
                  onOpen={() => open(n)}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {/* Preferences */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="font-semibold tracking-tight">{t("preferences")}</p>
            <p className="text-sm text-muted-foreground">
              {t("preferencesHint")}
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {MUTABLE.map(cat => {
              const Icon = CATEGORY_ICON[cat];
              const off = isMuted(cat);
              return (
                <div
                  key={cat}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg",
                        CATEGORY_TINT[cat]
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="text-sm font-medium">
                      {t(`cat_${cat}`)}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!off}
                    onClick={() => toggleMute(cat)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                      off ? "bg-muted" : "bg-primary"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-5 rounded-full bg-background shadow transition-all",
                        off ? "left-0.5" : "left-[1.375rem]"
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
        {children}
      </div>
    </div>
  );
}

function NotificationRow({
  n,
  locale,
  onOpen,
}: {
  n: {
    _id: string;
    type: string;
    title: string;
    body?: string;
    readAt?: number;
    createdAt: number;
  };
  locale: string;
  onOpen: () => void;
}) {
  const cat = categoryOf(n.type);
  const Icon = n.readAt ? BellOff : CATEGORY_ICON[cat];
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/50",
        !n.readAt && "bg-primary/5"
      )}
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
          {relativeTime(n.createdAt)} ·{" "}
          {new Date(n.createdAt).toLocaleDateString(locale)}
        </span>
      </span>
    </button>
  );
}
