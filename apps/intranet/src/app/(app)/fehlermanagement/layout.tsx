"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { AlertTriangle, ClipboardList, LayoutDashboard, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { PageHeader } from "@/components/PageHeader";
import { useIsManager } from "@/components/providers/current-user";

/**
 * QVM error/quality management (Fehlermanagement) — a standalone tool, not
 * part of the wiki. Ported from an 8D/PDCA-based prototype; see
 * `@/lib/error-management.ts` for the shared vocabulary and escalation logic.
 */
export default function FehlermanagementLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("ErrorManagement");
  const isManager = useIsManager();
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "list";

  const tabs = [
    { value: "list", href: "/fehlermanagement", label: t("tabErfassung"), icon: AlertTriangle },
    {
      value: "measures",
      href: "/fehlermanagement/measures",
      label: t("tabMeasures"),
      icon: ClipboardList,
    },
    {
      value: "dashboard",
      href: "/fehlermanagement/dashboard",
      label: t("tabDashboard"),
      icon: LayoutDashboard,
    },
    ...(isManager
      ? [
          {
            value: "settings",
            href: "/fehlermanagement/settings",
            label: t("tabSettings"),
            icon: Settings2,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        icon={<AlertTriangle />}
      />
      <RouteTabs tabs={tabs} activeValue={segment} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
