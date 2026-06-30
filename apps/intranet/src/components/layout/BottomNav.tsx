"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSidebar } from "@/components/ui/sidebar";

/**
 * Mobile-only floating action bar, Vercel-style: a "Find" search trigger and a
 * menu button that opens the full navigation sheet. Replaces a tab bar so the
 * primary actions sit in the thumb zone rather than the top header. A dot on the
 * menu signals unread chat / announcements (since those tabs are now behind it).
 */
export function BottomNav() {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const { setOpenMobile } = useSidebar();

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const chatUnread =
    chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  const unread = chatUnread + (announcementUnread ?? 0);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
      <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/90 p-1 shadow-lg shadow-black/30 backdrop-blur-xl">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new Event("command-palette:open"))
          }
          className="flex min-w-[10rem] items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="size-4 shrink-0" />
          <span>{tc("search")}</span>
        </button>
        <span className="h-5 w-px bg-border/70" aria-hidden />
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          aria-label={t("more")}
          className="relative flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
        >
          <Menu className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </button>
      </div>
    </div>
  );
}
