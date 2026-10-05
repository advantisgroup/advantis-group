"use client";

import { useEffect, type ReactNode } from "react";

import { useRouter } from "next/navigation";

import { type LucideIcon } from "lucide-react";

import {
  type PerformanceMe,
  usePerformanceAccess,
} from "@/components/performance/PerformanceAccess";
import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { cn } from "@/lib/utils";

/**
 * Gate for a Performance page with an access check (e.g. admins only):
 * sends the visitor back to the dashboard when `allowed` says no. `me` is
 * only returned once it passes.
 */
export function usePerformanceGate(allowed: (me: PerformanceMe) => boolean) {
  const router = useRouter();
  const { me, dashboard } = usePerformanceAccess();
  const ok = !!me && allowed(me);

  useEffect(() => {
    if (me && !ok) router.replace("/performance");
  }, [me, ok, router]);

  return { loading: me === undefined, me: ok ? me : null, dashboard };
}

/** Header, page title and bottom tabs around a Performance admin page. */
export function PerformanceShell({
  title,
  description,
  icon: Icon,
  actions,
  tabs,
  width = "max-w-6xl",
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Rendered between the title and the content, e.g. `RouteTabs`. */
  tabs?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader />
      <main className={cn("mx-auto space-y-6 p-4 pb-24 md:p-6", width)}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {tabs}
        {children}
      </main>
      <PerformanceBottomTabs />
    </div>
  );
}
