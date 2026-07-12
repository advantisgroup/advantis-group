"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import {
  CalendarClock,
  ShieldCheck,
  Sparkles,
  UserSearch,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/applicants/RouteTabs";
import { UploadCvButton } from "@/components/applicants/UploadCvButton";
import { PageHeader } from "@/components/PageHeader";
import {
  useCanManageApplicantAccess,
  useHasApplicantAccess,
} from "@/components/providers/current-user";

// The list-page tabs — anything else in the second path segment is an
// applicant id, i.e. a detail route that owns its own chrome entirely
// (see `[id]/layout.tsx`) and must not also get this layout's header/tabs.
// `neu` and `pool` are legacy routes that redirect into `list` filters.
const LIST_TABS = ["list", "termine", "neu", "pool", "profile", "access"];

/**
 * Access scope for Bewerbermanagement. Gated behind `useHasApplicantAccess()`
 * (admins, granted users, and delegates) — a narrower, per-user allowlist on
 * top of normal intranet auth, not tied to the manager/employee tier. Real
 * enforcement is server-side (`requireApplicantAccess` in Convex); this only
 * avoids flashing the UI at someone who'll immediately get 403s from every
 * query.
 *
 * Also owns the page-level chrome (header + tab nav) shared by the list-page
 * routes, since each tab is now its own real route rather than client-only
 * Tabs state. This layout wraps every `/applicants/*` route including
 * `/applicants/{id}/...`, so it renders that chrome only for the list tabs
 * and otherwise steps aside for the detail layout's own breadcrumb/header.
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

  const segment = pathname.split("/")[2];
  const isListRoute = segment === undefined || LIST_TABS.includes(segment);

  // The detail layout (`[id]/layout.tsx`) applies its own centered
  // max-w-6xl wrapper, so this just steps out of the way.
  if (!isListRoute) {
    return <>{children}</>;
  }

  const tabs = [
    {
      value: "list",
      href: "/applicants/list",
      label: t("tabList"),
      icon: Users,
    },
    {
      value: "termine",
      href: "/applicants/termine",
      label: t("tabTermine"),
      icon: CalendarClock,
    },
    {
      value: "profile",
      href: "/applicants/profile",
      label: t("tabProfile"),
      icon: Sparkles,
    },
    ...(canManageAccess
      ? [
          {
            value: "access",
            href: "/applicants/access",
            label: t("tabAccess"),
            icon: ShieldCheck,
          },
        ]
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
      <RouteTabs tabs={tabs} activeValue={segment} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
