"use client";

import { type ReactNode, useEffect, useMemo } from "react";

import { usePathname, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Building2, LayoutGrid, Package } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { RouteTabs, type RouteTab } from "@/components/layout/RouteTabs";
import { Badge } from "@/components/ui/badge";

export default function OfficeLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("Office");
  const router = useRouter();
  const pathname = usePathname();
  const access = useQuery(api.office.me);

  useEffect(() => {
    if (access && !access.access) router.replace("/");
  }, [access, router]);

  const tabs = useMemo<RouteTab[]>(
    () => [
      { value: "plan", href: "/office", label: t("tabs.plan"), icon: LayoutGrid },
      { value: "storage", href: "/office/lager", label: t("tabs.storage"), icon: Package },
    ],
    [t],
  );

  if (!access?.access) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeaderBar
        title={t("title")}
        description={t("intro")}
        icon={<Building2 className="size-4" />}
      />
      <RouteTabs
        tabs={tabs}
        activeValue={pathname.startsWith("/office/lager") ? "storage" : "plan"}
      />
      {!access.live && (
        <Badge variant="warning" title={t("adminsOnlyHint")}>
          {t("adminsOnly")}
        </Badge>
      )}
      {children}
    </div>
  );
}
