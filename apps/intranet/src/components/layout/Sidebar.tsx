"use client";

import { usePathname } from "next/navigation";

import { useQuery } from "convex/react";
import {
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

import { Link } from "@/components/Link";
import { BrandLogo } from "@/components/Logo";
import { useIsManager } from "@/components/providers/current-user";
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

  const chatConversations = useQuery(api.chat.listConversations);
  const announcementUnread = useQuery(api.announcements.unreadCount);
  const chatUnread =
    chatConversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;

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
    <div className="flex h-full flex-col gap-1">
      <div className="flex h-16 items-center px-4">
        <Link href="/" onClick={onNavigate} aria-label="Advantis Intranet">
          <BrandLogo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
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
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{t(item.labelKey)}</span>
                {item.badge ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
