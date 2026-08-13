"use client";

import Link from "next/link";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";

import { useBottomNavTabs } from "@/components/layout/bottom-nav-tabs";
import { MobilePageHeaderActions, usePageHeaderBarState } from "@/components/layout/PageHeaderBar";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Mobile-only floating action bar, Vercel-style: a "Find" search trigger and a
 * menu button that opens the full navigation sheet. Replaces a tab bar so the
 * primary actions sit in the thumb zone rather than the top header. A dot on the
 * menu signals unread chat / announcements (since those tabs are now behind it).
 *
 * When a page registers route tabs (via `useBottomNavTabs`, e.g. Applicant
 * Management's `RouteTabs` on mobile), their icons render first in the same
 * pill — so "the bottom nav" doubles as that page's tab switcher instead of
 * a separate dropdown, without losing the search/menu entry points.
 *
 * Same reasoning applies to a page's registered `PageHeaderActions` (see
 * `PageHeaderBar.tsx`): those render in the Intranet Header on desktop, but
 * a phone's top header is well outside thumb reach, so here they show up as
 * icon-only entries in this pill instead, right after any tabs.
 */
export function BottomNav() {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const { setOpenMobile } = useSidebar();
  const { tabs, activeValue } = useBottomNavTabs();

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const chatUnread = chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  const unread = chatUnread + (announcementUnread ?? 0);
  const hasTabs = tabs !== null && tabs.length > 0;
  const { actions: pageActions } = usePageHeaderBarState();
  const hasActions = pageActions !== null && pageActions.length > 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] print:hidden md:hidden">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-background/90 p-1 shadow-lg shadow-black/30 backdrop-blur-xl [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {hasTabs && (
          <>
            {tabs?.map((tab) => {
              const Icon = tab.icon;
              const active = tab.value === activeValue;
              const className = cn(
                "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              );
              const content = (
                <>
                  {active && (
                    <motion.span
                      layoutId="bottom-nav-active-tab"
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 32,
                      }}
                    />
                  )}
                  <Icon className="relative z-10 size-4" />
                </>
              );

              if (tab.href) {
                return (
                  <Link
                    key={tab.value}
                    href={tab.href}
                    aria-label={tab.label}
                    className={className}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-label={tab.label}
                  aria-pressed={active}
                  onClick={tab.onClick}
                  className={className}
                >
                  {content}
                </button>
              );
            })}
            <span className="h-5 w-px shrink-0 bg-border/70" aria-hidden />
          </>
        )}
        {hasActions && (
          <>
            <MobilePageHeaderActions />
            <span className="h-5 w-px shrink-0 bg-border/70" aria-hidden />
          </>
        )}
        <button
          type="button"
          onClick={() => {
            posthog.capture("bottom_nav_search_opened");
            window.dispatchEvent(new Event("command-palette:open"));
          }}
          aria-label={tc("search")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
            !hasTabs && "min-w-[10rem]",
          )}
        >
          <Search className="size-4 shrink-0" />
          {!hasTabs && <span>{tc("search")}</span>}
        </button>
        <span className="h-5 w-px shrink-0 bg-border/70" aria-hidden />
        <button
          type="button"
          onClick={() => {
            posthog.capture("bottom_nav_menu_opened");
            setOpenMobile(true);
          }}
          aria-label={t("more")}
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
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
