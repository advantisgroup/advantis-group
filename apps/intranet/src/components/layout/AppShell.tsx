"use client";

import type { ReactNode } from "react";

import { useMutation } from "convex/react";
import { useEffect } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";

import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { BottomNav } from "@/components/layout/BottomNav";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heartbeat = useMutation(api.presence.heartbeat);

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
    <SidebarProvider>
      <Sidebar />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border/70 bg-background/70 px-3 backdrop-blur-xl md:h-16 md:px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex flex-1 justify-start">
            <CommandPalette />
          </div>
          <NotificationsMenu />
          <SettingsMenu />
          <div className="mx-1 h-6 w-px bg-border/70" />
          <AccountMenu />
        </header>
        <main
          className={cn(
            "flex-1 px-4 pt-6 md:px-8 md:pt-8 md:pb-8",
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
    </SidebarProvider>
  );
}
