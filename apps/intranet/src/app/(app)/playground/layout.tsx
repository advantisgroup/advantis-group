"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { FlaskConical, Hand, MessagesSquare, Orbit, Palette, Shapes } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/layout/RouteTabs";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";

/**
 * A learning ground: the intranet's own pieces, live, to poke at. Admins
 * only — it's a workbench for building the intranet, and to everyone else it
 * read as a half-finished page that had leaked into search.
 */
export default function PlaygroundLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Playground");
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const active = pathname.split("/")[2] ?? "overview";

  const tabs: RouteTab[] = [
    { value: "overview", href: "/playground", label: t("tabs.overview"), icon: FlaskConical },
    { value: "drag", href: "/playground/drag", label: t("tabs.drag"), icon: Hand },
    { value: "motion", href: "/playground/motion", label: t("tabs.motion"), icon: Orbit },
    { value: "chat", href: "/playground/chat", label: t("tabs.chat"), icon: MessagesSquare },
    { value: "design", href: "/playground/design", label: t("tabs.design"), icon: Palette },
    {
      value: "components",
      href: "/playground/components",
      label: t("tabs.components"),
      icon: Shapes,
    },
  ];

  if (!isAdmin) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeaderBar title={t("title")} description={t("subtitle")} icon={<FlaskConical />} />
      <RouteTabs tabs={tabs} activeValue={active} />
      <div className="space-y-10">{children}</div>
    </div>
  );
}
