"use client";

import { useRouter } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { dashboardHome, usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { cn } from "@/lib/utils";

/** Picks which team dashboard is shown — side by side, the open one
 * standing out — only rendered for people who can
 * open more than one (admins, or someone in several teams). */
export function DashboardSwitcher({ className }: { className?: string }) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const { me, dashboard, selectDashboard } = usePerformanceAccess();
  const dashboards = me?.dashboards ?? [];
  if (dashboards.length < 2 || !dashboard) return null;

  const open = (value: Id<"companies">) => {
    const next = dashboards.find((d) => d.companyId === value);
    if (!next || value === dashboard.companyId) return;
    selectDashboard(value);
    router.push(dashboardHome(next));
  };

  return (
    <div
      role="tablist"
      aria-label={t("dashboardSwitcherLabel")}
      className={cn(
        "inline-flex items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5",
        className,
      )}
    >
      {dashboards.map((d) => {
        const active = d.companyId === dashboard.companyId;
        return (
          <button
            key={d.companyId}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => open(d.companyId)}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
