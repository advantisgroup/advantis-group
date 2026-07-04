"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";

import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { BottomNav } from "@/components/layout/BottomNav";
import { BrowserNotificationBridge } from "@/components/notifications/BrowserNotificationBridge";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Sidebar } from "@/components/layout/Sidebar";
import { TourCompletionScreen } from "@/components/tour/TourCompletionScreen";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { TourPopout } from "@/components/tour/TourPopout";
import { TourProgressChip } from "@/components/tour/TourProgressChip";
import { TourProvider, useTour } from "@/components/tour/TourProvider";
import { TourSpotlight } from "@/components/tour/TourSpotlight";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heartbeat = useMutation(api.presence.heartbeat);
  const mainRef = useRef<HTMLElement>(null);
  const { state: tourState, phase: tourPhase, targetRect } = useTour();
  const tourActive = (tourState?.active && tourPhase === "active") ?? false;

  // The main pane is the scroll container (not the window), so reset it to the
  // top on navigation — otherwise a new page would open mid-scroll.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Chat is a full-screen, self-managing view on mobile (its own header and
  // sticky composer), so it opts out of the bottom nav and its clearance.
  const immersive = pathname.startsWith("/chat");

  // Keep presence fresh while the app is open so chat can show online state.
  useEffect(() => {
    void heartbeat({});
    const id = setInterval(() => void heartbeat({}), 30_000);
    return () => clearInterval(id);
  }, [heartbeat]);

  return (
    <>
      <Sidebar />
      <SidebarInset>
        <header
          data-tour="tour-header"
          className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-border/70 bg-background/70 px-2.5 backdrop-blur-xl print:hidden md:h-16 md:px-4"
        >
          <SidebarTrigger className="-ml-1" />
          {/* Search lives in the desktop header, but on mobile it moves to the
              reachable bottom bar — so here it's just a flex spacer. The
              component stays mounted so ⌘K and the bottom-bar trigger work. */}
          <div className="flex flex-1 justify-start">
            <div className="hidden w-full md:flex">
              <CommandPalette />
            </div>
          </div>
          {/* Tour progress — compact checkmark chip; self-hides when finished. */}
          <TourProgressChip />
          <div data-tour="tour-notifications-btn" className="flex items-center">
            <NotificationsMenu />
          </div>
          {/* Preferences + account live in the top bar on desktop, but move to
              the sidebar footer on mobile to keep the header compact. */}
          <SettingsMenu className="hidden md:inline-flex" />
          <div className="mx-1 hidden h-6 w-px bg-border/70 md:block" />
          <AccountMenu triggerClassName="hidden md:flex" />
        </header>
        <main
          ref={mainRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-4 pt-6 print:overflow-visible md:px-8 md:pt-8 md:pb-8",
            immersive ? "pb-6" : "pb-[calc(env(safe-area-inset-bottom)+5rem)]"
          )}
        >
          {/* Isolate page crashes so the surrounding shell stays usable.
              Keyed by route so navigating away clears a previous error. */}
          <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
        </main>
      </SidebarInset>

      {/* Mobile bottom navigation */}
      {!immersive && <BottomNav />}

      {/* Native browser notifications for background tabs (opt-in). */}
      <BrowserNotificationBridge />

      {/* Tour UI layers (portal-based, fixed position) */}
      <TourOverlay targetRect={targetRect} visible={tourActive} />
      <TourSpotlight targetRect={targetRect} visible={tourActive} />
      <TourPopout />
      <TourCompletionScreen />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <TourProvider>
        <AppShellInner>{children}</AppShellInner>
      </TourProvider>
    </SidebarProvider>
  );
}
