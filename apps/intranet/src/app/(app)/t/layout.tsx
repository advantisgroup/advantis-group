"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { FlaskConical, Hand, MessagesSquare, Orbit, Palette, Shapes } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/applicants/RouteTabs";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";

/** A learning ground: the intranet's own pieces, live, to poke at. */
export default function PlaygroundLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Playground");
  const pathname = usePathname();
  const active = pathname.split("/")[2] ?? "overview";

  const tabs: RouteTab[] = [
    { value: "overview", href: "/t", label: t("tabs.overview"), icon: FlaskConical },
    { value: "drag", href: "/t/drag", label: t("tabs.drag"), icon: Hand },
    { value: "motion", href: "/t/motion", label: t("tabs.motion"), icon: Orbit },
    { value: "chat", href: "/t/chat", label: t("tabs.chat"), icon: MessagesSquare },
    { value: "design", href: "/t/design", label: t("tabs.design"), icon: Palette },
    { value: "components", href: "/t/components", label: t("tabs.components"), icon: Shapes },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeaderBar title={t("title")} description={t("subtitle")} icon={<FlaskConical />} />
      <RouteTabs tabs={tabs} activeValue={active} />
      <div className="space-y-10">{children}</div>
    </div>
  );
}
