import type { ReactNode } from "react";

import { headers } from "next/headers";

import { BottomNavTabsProvider } from "@/components/layout/bottom-nav-tabs";
import { PerformanceCompanyProvider } from "@/components/performance/PerformanceCompanyProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

// Performance runs outside the Clerk-gated `(app)` shell (own auth, own
// header — same carve-out as `/guest`), so it never inherits the shell's
// TooltipProvider (bundled inside SidebarProvider) or BottomNavTabsProvider
// (mounted in AppShell). Every page under here — not just the RouteTabs
// ones — needs both, so they're provided once at the root instead of
// per-page.
export default async function PerformanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Set by proxy.ts's tenant-subdomain rewrite; absent on the main intranet
  // host, where PerformanceCompanyProvider falls back to Advantis's slug.
  const headerList = await headers();
  const companyId = headerList.get("x-performance-company-id");
  const slug = headerList.get("x-performance-company-slug");
  const company = companyId && slug ? { companyId, slug } : null;

  return (
    <TooltipProvider delayDuration={150}>
      <BottomNavTabsProvider>
        <PerformanceCompanyProvider company={company}>
          {children}
        </PerformanceCompanyProvider>
      </BottomNavTabsProvider>
    </TooltipProvider>
  );
}
