"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { BookOpen, FolderKanban, PhoneCall } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { PageHeader } from "@/components/PageHeader";

/**
 * Sales Cockpit — call prep for sales campaigns. Ported from a standalone
 * prototype (window.storage/base64-backed) into real Convex-persisted data;
 * see `packages/convex/convex/salesCockpit.ts` for the backend.
 */
export default function SalesCockpitLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("SalesCockpit");
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "home";

  const tabs = [
    { value: "home", href: "/sales-cockpit", label: t("tabTelefonieren"), icon: PhoneCall },
    {
      value: "projekte",
      href: "/sales-cockpit/projekte",
      label: t("tabProjekte"),
      icon: FolderKanban,
    },
    {
      value: "lexikon",
      href: "/sales-cockpit/lexikon",
      label: t("tabLexikon"),
      icon: BookOpen,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} icon={<PhoneCall />} />
      <RouteTabs tabs={tabs} activeValue={segment} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
