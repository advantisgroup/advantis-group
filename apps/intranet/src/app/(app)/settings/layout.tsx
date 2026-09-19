"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { Bell, CircleHelp, SlidersHorizontal, Sparkles, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/applicants/RouteTabs";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";

type SettingsSectionId = "account" | "workspace" | "notifications" | "ai" | "trash" | "help";

const HINT_KEY: Record<SettingsSectionId, string> = {
  account: "accountHint",
  workspace: "workspaceHint",
  notifications: "notificationsHint",
  ai: "aiHint",
  trash: "trashHint",
  help: "helpHint",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Settings");
  const pathname = usePathname();
  const active = (pathname.split("/")[2] ?? "account") as SettingsSectionId;

  const tabs: RouteTab[] = [
    { value: "account", href: "/settings/account", label: t("account"), icon: UserRound },
    {
      value: "workspace",
      href: "/settings/workspace",
      label: t("workspace"),
      icon: SlidersHorizontal,
    },
    {
      value: "notifications",
      href: "/settings/notifications",
      label: t("notifications"),
      icon: Bell,
    },
    { value: "ai", href: "/settings/ai", label: t("ai"), icon: Sparkles },
    { value: "trash", href: "/settings/trash", label: t("trash"), icon: Trash2 },
    { value: "help", href: "/settings/help", label: t("help"), icon: CircleHelp },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 refreshed:max-w-6xl refreshed:space-y-6">
      <PageHeaderBar
        title={t("title")}
        description={t(HINT_KEY[active] ?? "accountHint")}
        tourCheckpoint="settings"
      />
      <RouteTabs tabs={tabs} activeValue={active} />
      <div className="space-y-4 refreshed:space-y-10">{children}</div>
    </div>
  );
}
