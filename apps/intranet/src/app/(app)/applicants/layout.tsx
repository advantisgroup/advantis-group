"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { UserSearch } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { UploadCvButton } from "@/components/applicants/UploadCvButton";
import { PageHeader } from "@/components/PageHeader";
import {
  useCanManageApplicantAccess,
  useHasApplicantAccess,
} from "@/components/providers/current-user";

/**
 * Access scope for Bewerbermanagement. Gated behind `useHasApplicantAccess()`
 * (admins, granted users, and delegates) — a narrower, per-user allowlist on
 * top of normal intranet auth, not tied to the manager/employee tier. Real
 * enforcement is server-side (`requireApplicantAccess` in Convex); this only
 * avoids flashing the UI at someone who'll immediately get 403s from every
 * query.
 *
 * Also owns the page-level chrome (header + tab nav) shared by every
 * `/applicants/*` route, since each tab is now its own real route rather
 * than client-only Tabs state.
 */
export default function ApplicantsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("Applicants");
  const hasAccess = useHasApplicantAccess();
  const canManageAccess = useCanManageApplicantAccess();
  const pathname = usePathname();

  if (!hasAccess) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">403</p>
    );
  }

  const activeValue = pathname.split("/")[2] ?? "termine";
  const tabs = [
    { value: "termine", href: "/applicants/termine", label: t("tabTermine") },
    { value: "neu", href: "/applicants/neu", label: t("tabNeu") },
    { value: "pool", href: "/applicants/pool", label: t("tabPool") },
    {
      value: "profile",
      href: "/applicants/profile",
      label: t("tabProfile"),
    },
    ...(canManageAccess
      ? [{ value: "access", href: "/applicants/access", label: t("tabAccess") }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        icon={<UserSearch />}
        action={<UploadCvButton />}
      />
      <RouteTabs tabs={tabs} activeValue={activeValue} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
