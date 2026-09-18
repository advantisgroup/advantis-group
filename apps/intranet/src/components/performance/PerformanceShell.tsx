"use client";

import { useEffect, type ReactNode } from "react";

import { useRouter } from "next/navigation";

import { type api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";
import { type LucideIcon } from "lucide-react";

import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { clearPerformanceToken } from "@/lib/performanceAuth";
import { cn } from "@/lib/utils";

export type ValidPerformanceSession = Extract<
  FunctionReturnType<typeof api.performance.auth.validateSession>,
  { valid: true }
>;

/**
 * Session gate for a Performance page with a permission check: bounces to
 * the login page when the session is gone, and back to the dashboard when
 * `allowed` says no. `session` is only returned once both pass.
 */
export function usePerformanceGate(allowed: (session: ValidPerformanceSession) => boolean) {
  const router = useRouter();
  const { token, session } = usePerformanceSession();
  const ok = !!session?.valid && allowed(session);

  useEffect(() => {
    // Wait for the query to resolve — a visitor with no password cookie may
    // still resolve via their linked Clerk identity.
    if (!session) return;
    if (!session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    } else if (!ok) {
      router.replace("/performance");
    }
  }, [session, ok, router]);

  return {
    token,
    loading: session === undefined,
    session: ok && session?.valid ? session : null,
  };
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
