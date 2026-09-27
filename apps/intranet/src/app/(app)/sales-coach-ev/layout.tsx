"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { BookOpen, PhoneCall, Settings2, TrendingUp, Users, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/layout/RouteTabs";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";

/**
 * Sales Coach EV — live call-coaching for Projekt Elektromobilitaet. Ported
 * from a standalone client-only prototype into real Clerk auth + Convex
 * storage; see packages/convex/convex/salesCoachEv/ for the backend and
 * apps/api/src/routes/sales-coach-ev.ts for the AI proxy. Every employee
 * gets the Call/Fortschritt/Wiki/Einstellungen tabs; only intranet admins
 * (`users.role === "admin"`) additionally get the Team tab.
 */
export default function SalesCoachEvLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("SalesCoachEv");
  const isAdmin = useIsAdmin();
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "call";

  const tabs = [
    { value: "call", href: "/sales-coach-ev", label: t("tabCall"), icon: PhoneCall },
    {
      value: "progress",
      href: "/sales-coach-ev/progress",
      label: t("tabProgress"),
      icon: TrendingUp,
    },
    { value: "wiki", href: "/sales-coach-ev/wiki", label: t("tabWiki"), icon: BookOpen },
    {
      value: "settings",
      href: "/sales-coach-ev/settings",
      label: t("tabSettings"),
      icon: Settings2,
    },
    ...(isAdmin
      ? [{ value: "admin", href: "/sales-coach-ev/admin", label: t("tabAdmin"), icon: Users }]
      : []),
  ];

  // The call is a workspace, not a page of cards: it takes the whole width
  // and height instead of sitting in the reading column.
  if (segment === "call") {
    return (
      <>
        <PageHeaderBar title={t("pageTitle")} description={t("pageDescription")} icon={<Zap />} />
        <RouteTabs tabs={tabs} activeValue={segment} />
        {children}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeaderBar title={t("pageTitle")} description={t("pageDescription")} icon={<Zap />} />
      <RouteTabs tabs={tabs} activeValue={segment} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
