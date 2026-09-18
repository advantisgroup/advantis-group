"use client";

import { useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  LayoutDashboard,
  type LucideIcon,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { clearPerformanceToken, getPerformanceToken } from "@/lib/performanceAuth";

export interface PerformanceNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

/**
 * The one place Performance's navigation is decided, straight from the
 * session's permissions — every page shows the same set, so moving between
 * Uploads, Users and Roles never needs a detour through the dashboard.
 *
 * Reads the session with a plain `useQuery` rather than
 * `usePerformanceSession`, which would kick off a second Clerk-link
 * promotion alongside the page's own.
 */
export function usePerformanceNav() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const pathname = usePathname();
  const [token] = useState(() => getPerformanceToken() ?? "");
  const session = useQuery(api.performanceAuth.validateSession, { token });
  const logout = useMutation(api.performanceAuth.logout);

  if (!session?.valid) return { items: [], passwordHref: null, exit: undefined };

  const can = (p: string) => session.permissions.includes(p);
  const matches = (prefix: string) => pathname.startsWith(prefix);

  const extra: Omit<PerformanceNavItem, "active">[] = [
    ...(can("upload_reports")
      ? [{ href: "/performance/upload", label: t("navUploads"), icon: Upload }]
      : []),
    ...(can("manage_logins")
      ? [{ href: "/performance/benutzer", label: t("usersLink"), icon: Users }]
      : []),
    // Super-admins land on the company list; a scoped admin only has roles.
    ...(session.isSuperAdmin
      ? [{ href: "/performance/admin/companies", label: t("companiesLink"), icon: Building2 }]
      : can("manage_roles")
        ? [{ href: "/performance/admin/companies/roles", label: t("rolesLink"), icon: ShieldCheck }]
        : []),
  ];
  const activeExtra = (href: string) =>
    matches(href.startsWith("/performance/admin") ? "/performance/admin" : href);
  const onExtra = extra.some((item) => activeExtra(item.href));

  const dashboardHref = can("view_all_employees")
    ? "/performance/ueberblick"
    : session.employeeId
      ? `/performance/mitarbeiter/${session.employeeId}`
      : "/performance";

  const items: PerformanceNavItem[] = [
    {
      href: dashboardHref,
      label: t("navDashboard"),
      icon: LayoutDashboard,
      active: !onExtra && !matches("/performance/passwort"),
    },
    ...extra.map((item) => ({ ...item, active: activeExtra(item.href) })),
  ];

  function exit() {
    if (token) void logout({ token });
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  return {
    // A lone "Dashboard" link isn't navigation, just noise.
    items: items.length > 1 ? items : [],
    passwordHref: session.viaClerk ? null : "/performance/passwort",
    // A Clerk-linked session has no Performance login to sign out of.
    exit: session.viaClerk ? undefined : exit,
  };
}
