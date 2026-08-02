"use client";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Bell, BellOff, Check, ChevronRight, Settings2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/format";
import { bucketFor, notificationVisual, type NotificationBucket } from "@/lib/notification-kinds";
import { cn } from "@/lib/utils";

const BUCKET_ORDER: NotificationBucket[] = ["today", "yesterday", "earlier"];

export function NotificationsMenu() {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const notifications = useQuery(api.notifications.list, { limit: 20 });
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const remove = useMutation(api.notifications.remove);

  // Newest first within a day; the day headings carry the ordering the old
  // unread-first sort was trying to express, without shuffling an item out
  // from under the cursor the moment it's read.
  const grouped = notifications
    ? BUCKET_ORDER.map((bucket) => ({
        bucket,
        items: [...notifications]
          .filter((n) => bucketFor(n.createdAt) === bucket)
          .sort((a, b) => b.createdAt - a.createdAt),
      })).filter((g) => g.items.length > 0)
    : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("title")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <span className="text-sm font-semibold">{t("title")}</span>
          {unread > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              {unread}
            </span>
          )}
          <span className="flex-1" />
          {unread > 0 && (
            <button
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => void markAllRead({})}
            >
              <Check className="size-3.5" />
              {t("markAllRead")}
            </button>
          )}
          <Link
            href="/settings#notifications"
            aria-label={t("preferences")}
            title={t("preferences")}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="size-3.5" />
          </Link>
        </div>

        <ScrollArea className="max-h-[26rem]">
          {grouped === undefined ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
                  <span className="flex-1 space-y-1.5 py-1">
                    <span className="block h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                    <span className="block h-2 w-1/3 animate-pulse rounded bg-muted" />
                  </span>
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <BellOff className="size-6 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.bucket}>
                <p className="sticky top-0 z-10 bg-popover/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t(`bucket.${group.bucket}`)}
                </p>
                {group.items.map((n) => {
                  const { icon: Icon, tint } = notificationVisual(n.type);
                  return (
                    <div
                      key={n._id}
                      className={cn(
                        "group/row relative flex items-start gap-2.5 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/60",
                        !n.readAt && "bg-primary/[0.04]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4",
                          tint,
                        )}
                      >
                        <Icon />
                      </span>
                      <button
                        onClick={() => {
                          void markRead({ notificationId: n._id });
                          if (n.link) router.push(n.link);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span
                          className={cn(
                            "block break-words text-sm",
                            n.readAt ? "font-medium text-muted-foreground" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground/80">
                          {relativeTime(n.createdAt)}
                        </span>
                      </button>
                      {/* Unread marker doubles as the dismiss target on hover,
                          so clearing one doesn't mean opening it first. */}
                      <span className="mt-1 flex shrink-0 items-center">
                        {!n.readAt && (
                          <span className="hidden size-2 rounded-full bg-primary md:inline-block md:group-hover/row:hidden" />
                        )}
                        <button
                          aria-label={t("dismiss")}
                          title={t("dismiss")}
                          onClick={() => void remove({ notificationId: n._id })}
                          // Touch devices have no hover to reveal this, so it
                          // stays visible below md and only hides behind hover
                          // on pointer layouts.
                          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden md:group-hover/row:grid"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </ScrollArea>

        <Link
          href="/notifications"
          className="flex items-center justify-center gap-1 border-t px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-muted"
        >
          {t("viewAll")}
          <ChevronRight className="size-4" />
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
