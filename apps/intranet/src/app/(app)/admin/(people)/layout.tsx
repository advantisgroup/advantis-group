"use client";

import { type ReactNode, useMemo } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Building2, Clock, Mail, ShieldCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs } from "@/components/layout/RouteTabs";
import { useIsAdmin, useIsManager } from "@/components/providers/current-user";

/**
 * Everything about the staff in one place (12.11.2026, Vahan): members,
 * invites, access requests, departments & teams and roles are tabs of
 * "Mitglieder" instead of five sidebar entries. Each tab keeps its own route
 * and its own access check.
 */
export default function PeopleLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const pendingRequests = useQuery(
    api.people.accessRequests.list,
    isManager ? { status: "pending" } : "skip",
  );
  const requestCount = pendingRequests?.length ?? 0;

  const tabs = useMemo(
    () => [
      { value: "members", href: "/admin/members", label: t("nav.members"), icon: Users },
      { value: "invites", href: "/admin/invites", label: t("nav.invites"), icon: Mail },
      {
        value: "requests",
        href: "/admin/requests",
        label: t("nav.requests"),
        icon: Clock,
        count: requestCount > 0 ? requestCount : undefined,
      },
      ...(isAdmin
        ? [
            {
              value: "structure",
              href: "/admin/structure",
              label: t("nav.structure"),
              icon: Building2,
            },
          ]
        : []),
      { value: "roles", href: "/admin/roles", label: t("nav.roles"), icon: ShieldCheck },
    ],
    [t, isAdmin, requestCount],
  );

  const active = pathname.split("/")[2] ?? "members";

  return (
    <>
      {isManager && <RouteTabs tabs={tabs} activeValue={active} />}
      {children}
    </>
  );
}
