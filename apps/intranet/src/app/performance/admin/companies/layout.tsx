"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { Building2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/applicants/RouteTabs";
import { PerformanceShell, usePerformanceGate } from "@/components/performance/PerformanceShell";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";

const COMPANIES_PATH = "/performance/admin/companies";
const ROLES_PATH = "/performance/admin/companies/roles";

/**
 * Companies and their roles as tabs of one admin area. A super-admin gets
 * both; a scoped admin who can only manage_roles has no company list and
 * lands straight on Roles. A super-admin always has every permission (see
 * performanceAuth.ts's validateSession), so manage_roles covers both.
 */
export default function CompaniesAdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const pathname = usePathname();
  const { loading, session } = usePerformanceGate(
    (s) => s.isSuperAdmin || s.permissions.includes("manage_roles"),
  );
  const onCompanyList = !!session && !session.isSuperAdmin && pathname === COMPANIES_PATH;

  useEffect(() => {
    if (onCompanyList) router.replace(ROLES_PATH);
  }, [onCompanyList, router]);

  if (loading) return <PerformancePageSkeleton />;
  if (!session || onCompanyList) return null;

  const onRoles = pathname === ROLES_PATH;
  const tabs: RouteTab[] = session.isSuperAdmin
    ? [
        { value: "companies", href: COMPANIES_PATH, label: t("companiesTitle"), icon: Building2 },
        { value: "roles", href: ROLES_PATH, label: t("rolesTitle"), icon: ShieldCheck },
      ]
    : [];

  return (
    <PerformanceShell
      title={onRoles ? t("rolesTitle") : t("companiesTitle")}
      description={onRoles ? t("rolesIntro") : t("companiesIntro")}
      tabs={
        tabs.length > 0 && (
          <RouteTabs tabs={tabs} activeValue={onRoles ? "roles" : "companies"} inline />
        )
      }
    >
      {children}
    </PerformanceShell>
  );
}
