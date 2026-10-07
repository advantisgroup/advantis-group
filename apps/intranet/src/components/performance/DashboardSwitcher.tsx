"use client";

import { useRouter } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { dashboardHome, usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Picks which team dashboard is shown — only rendered for people who can
 * open more than one (admins, or someone in several teams). */
export function DashboardSwitcher({ className }: { className?: string }) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const { me, dashboard, selectDashboard } = usePerformanceAccess();
  const dashboards = me?.dashboards ?? [];
  if (dashboards.length < 2 || !dashboard) return null;

  return (
    <Select
      value={dashboard.companyId}
      onValueChange={(value) => {
        const next = dashboards.find((d) => d.companyId === value);
        if (!next) return;
        selectDashboard(value as Id<"companies">);
        router.push(dashboardHome(next));
      }}
    >
      <SelectTrigger
        className={cn("h-8 w-auto min-w-40 gap-2", className)}
        aria-label={t("dashboardSwitcherLabel")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {dashboards.map((d) => (
          <SelectItem key={d.companyId} value={d.companyId}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
