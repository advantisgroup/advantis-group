"use client";

import { usePathname } from "next/navigation";

import { useQuery } from "convex/react";
import {
  BookOpen,
  Calendar,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Plane,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";

import { accessibleGuidebooks } from "@/components/guidebooks/registry";
import { Link } from "@/components/Link";
import { WordmarkLogo } from "@/components/Logo";
import {
  useCurrentUser,
  useIsManager,
} from "@/components/providers/current-user";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  managerOnly?: boolean;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const isManager = useIsManager();
  const user = useCurrentUser();

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const chatUnread =
    chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  const hasGuidebooks = accessibleGuidebooks(user).length > 0;

  const items: NavItem[] = [
    { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/calendar", labelKey: "calendar", icon: Calendar },
    { href: "/absences", labelKey: "absences", icon: Plane },
    {
      href: "/announcements",
      labelKey: "announcements",
      icon: Megaphone,
      badge: announcementUnread,
    },
    { href: "/chat", labelKey: "chat", icon: MessageSquare, badge: chatUnread },
    ...(hasGuidebooks
      ? [{ href: "/guidebooks", labelKey: "guidebooks", icon: BookOpen }]
      : []),
    { href: "/directory", labelKey: "directory", icon: Users },
    {
      href: "/admin",
      labelKey: "admin",
      icon: ShieldCheck,
      managerOnly: true,
    },
    { href: "/settings", labelKey: "settings", icon: Settings },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/" onClick={onNavigate} aria-label="Advantis Intranet">
          <WordmarkLogo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3">
        {items
          .filter(item => !item.managerOnly || isManager)
          .map(item => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-all",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                  )}
                />
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-transform",
                    active
                      ? "text-primary"
                      : "text-muted-foreground group-hover:scale-110 group-hover:text-foreground"
                  )}
                />
                <span className="flex-1 truncate">{t(item.labelKey)}</span>
                {item.badge ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </nav>
      <div className="px-5 py-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Advantis Group
      </div>
    </div>
  );
}
