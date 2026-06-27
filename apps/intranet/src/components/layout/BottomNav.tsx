"use client";

import { usePathname } from "next/navigation";

import { useQuery } from "convex/react";
import {
  Calendar,
  LayoutDashboard,
  Megaphone,
  Menu,
  MessageSquare,
} from "lucide-react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

/**
 * Mobile-only bottom tab bar. Gives one-tap access to the primary
 * destinations on phones, where the sidebar is hidden behind a sheet.
 * The trailing "More" button opens the full navigation sidebar.
 */
export function BottomNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const chatUnread =
    chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;

  const items: NavItem[] = [
    { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/calendar", labelKey: "calendar", icon: Calendar },
    { href: "/chat", labelKey: "chat", icon: MessageSquare, badge: chatUnread },
    {
      href: "/announcements",
      labelKey: "announcements",
      icon: Megaphone,
      badge: announcementUnread,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("dashboard")}
    >
      <div className="flex h-14 items-stretch">
        {items.map(item => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <Icon className="size-5" />
                {item.badge ? (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold tabular-nums text-primary-foreground">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate px-1">
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          aria-label={t("more")}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Menu className="size-5" />
          <span>{t("more")}</span>
        </button>
      </div>
    </nav>
  );
}
