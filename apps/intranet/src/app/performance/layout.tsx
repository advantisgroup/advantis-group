import type { ReactNode } from "react";

import { auth } from "@clerk/nextjs/server";

import { AppGate } from "@/components/layout/AppGate";
import { BottomNavTabsProvider } from "@/components/layout/bottom-nav-tabs";
import { PerformanceAccessProvider } from "@/components/performance/PerformanceAccess";
import { TooltipProvider } from "@/components/ui/tooltip";

// Performance has its own header and bottom tabs instead of the intranet's
// sidebar, but the same sign-in: Clerk plus `AppGate` (access request,
// step-up), rendered `bare`. That leaves the TooltipProvider (bundled in
// SidebarProvider) and BottomNavTabsProvider (in AppShell) to provide here.
export default async function PerformanceLayout({ children }: { children: ReactNode }) {
  await auth.protect();

  return (
    <AppGate bare>
      <TooltipProvider delayDuration={150}>
        <BottomNavTabsProvider>
          <PerformanceAccessProvider>{children}</PerformanceAccessProvider>
        </BottomNavTabsProvider>
      </TooltipProvider>
    </AppGate>
  );
}
