import type { ReactNode } from "react";

import { BottomNavTabsProvider } from "@/components/layout/bottom-nav-tabs";
import { TooltipProvider } from "@/components/ui/tooltip";

// Performance runs outside the Clerk-gated `(app)` shell (own auth, own
// header — same carve-out as `/guest`), so it never inherits the shell's
// TooltipProvider (bundled inside SidebarProvider) or BottomNavTabsProvider
// (mounted in AppShell). Every page under here — not just the RouteTabs
// ones — needs both, so they're provided once at the root instead of
// per-page.
export default function PerformanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <BottomNavTabsProvider>{children}</BottomNavTabsProvider>
    </TooltipProvider>
  );
}
