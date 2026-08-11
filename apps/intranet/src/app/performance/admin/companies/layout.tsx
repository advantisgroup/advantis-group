"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { Building2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { RouteTabs, type RouteTab } from "@/components/applicants/RouteTabs";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { clearPerformanceToken } from "@/lib/performanceAuth";

const COMPANIES_PATH = "/performance/admin/companies";
const ROLES_PATH = "/performance/admin/companies/roles";

/**
 * Shared chrome for the two Performance admin surfaces that used to be
 * separate dashboard nav entries (Companies, Roles) reachable only by their
 * own dedicated pages. Company management and role management for that
 * company are naturally one workflow — a super-admin picking a company's
 * roles is one step past picking the company itself — so they now live as
 * tabs under a single `/performance/admin/companies` nav entry instead of
 * competing for space in the dashboard header.
 */
export default function CompaniesAdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const pathname = usePathname();
  const { session } = usePerformanceSession();

  // A super-admin always has every permission (see performanceAuth.ts's
  // validateSession), so this alone already covers both audiences.
  const canManageRoles = session?.valid && session.permissions.includes("manage_roles");

  useEffect(() => {
    if (!session) return;
    if (!session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
      return;
    }
    if (!session.isSuperAdmin && !canManageRoles) {
      router.replace("/performance");
      return;
    }
    // The company list (creating/editing companies) is isSuperAdmin-only —
    // a scoped company admin who can only manage_roles has nothing to see
    // at the base path, so land them straight on the one tab they do have.
    if (!session.isSuperAdmin && pathname === COMPANIES_PATH) {
      router.replace(ROLES_PATH);
    }
  }, [session, router, pathname, canManageRoles]);

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid || (!session.isSuperAdmin && !canManageRoles)) return null;
  if (!session.isSuperAdmin && pathname === COMPANIES_PATH) return null; // redirecting

  const navItems = [{ href: "/performance", label: t("backToDashboard") }];

  const tabs: RouteTab[] = [
    ...(session.isSuperAdmin
      ? [
          {
            value: "companies",
            href: COMPANIES_PATH,
            label: t("companiesTitle"),
            icon: Building2,
          },
        ]
      : []),
    ...(canManageRoles
      ? [
          {
            value: "roles",
            href: ROLES_PATH,
            label: t("rolesTitle"),
            icon: ShieldCheck,
          },
        ]
      : []),
  ];
  const activeTab = pathname === ROLES_PATH ? "roles" : "companies";

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader navItems={navItems} onExit={session.viaClerk ? undefined : exit} />
      {tabs.length > 1 && (
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <RouteTabs tabs={tabs} activeValue={activeTab} />
        </div>
      )}
      {children}
      <PerformanceBottomTabs navItems={navItems} onExit={session.viaClerk ? undefined : exit} />
    </div>
  );
}
