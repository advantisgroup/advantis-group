"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { BookOpen, FolderKanban, PhoneCall, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";

/**
 * Sales Cockpit — call prep for sales campaigns. Ported from a standalone
 * prototype (window.storage/base64-backed) into real Convex-persisted data;
 * see `packages/convex/convex/salesCockpit.ts` for the backend.
 */
export default function SalesCockpitLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("SalesCockpit");
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "home";

  // The flow composer (`/sales-cockpit/flows/[flowId]`) is a full-page,
  // immersive editor in the same vein as `/announcements/new` — the tab bar
  // and the `max-w-5xl` reading-width wrapper would just eat into its canvas,
  // so it opts out of both and renders full-bleed.
  const isFlowComposer = segment === "flows" && pathname.split("/").length > 3;
  if (isFlowComposer) return <>{children}</>;

  const tabs = [
    { value: "home", href: "/sales-cockpit", label: t("tabTelefonieren"), icon: PhoneCall },
    {
      value: "projekte",
      href: "/sales-cockpit/projekte",
      label: t("tabProjekte"),
      icon: FolderKanban,
    },
    {
      value: "flows",
      href: "/sales-cockpit/flows",
      label: t("tabFlows"),
      icon: Workflow,
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
      <PageHeaderBar
        title={t("pageTitle")}
        description={t("pageDescription")}
        icon={<PhoneCall />}
      />
      <RouteTabs tabs={tabs} activeValue={segment} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
