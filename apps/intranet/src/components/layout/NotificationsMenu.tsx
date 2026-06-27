"use client";

import { useMutation, useQuery } from "convex/react";
import { Bell, ChevronRight } from "lucide-react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsMenu() {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const notifications = useQuery(api.notifications.list, { limit: 20 });
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  // Surface unread first so read items never bury fresh ones.
  const ordered = notifications
    ? [...notifications].sort((a, b) => {
        const au = a.readAt ? 1 : 0;
        const bu = b.readAt ? 1 : 0;
        if (au !== bu) return au - bu;
        return b.createdAt - a.createdAt;
      })
    : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("title")}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">{t("title")}</span>
          {unread > 0 && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => void markAllRead({})}
            >
              {t("markAllRead")}
            </button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {ordered && ordered.length > 0 ? (
            ordered.slice(0, 8).map(n => (
              <button
                key={n._id}
                onClick={() => {
                  void markRead({ notificationId: n._id });
                  if (n.link) router.push(n.link);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                  !n.readAt && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    n.readAt ? "bg-transparent" : "bg-primary"
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      "truncate",
                      n.readAt ? "font-medium text-muted-foreground" : "font-semibold"
                    )}
                  >
                    {n.title}
                  </span>
                  {n.body && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {relativeTime(n.createdAt)} ·{" "}
                    {new Date(n.createdAt).toLocaleDateString(locale)}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
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
