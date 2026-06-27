"use client";

import type { ReactNode } from "react";

import { useMutation } from "convex/react";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";

import { CommandPalette } from "@/components/CommandPalette";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const heartbeat = useMutation(api.presence.heartbeat);

  // Keep presence fresh while the app is open so chat can show online state.
  useEffect(() => {
    void heartbeat({});
    const id = setInterval(() => void heartbeat({}), 30_000);
    return () => clearInterval(id);
  }, [heartbeat]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-card/60 md:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 border-r border-border/70 bg-card shadow-2xl animate-in slide-in-from-left">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "sticky top-0 z-30 flex h-16 items-center gap-1 border-b border-border/70 bg-background/70 px-4 backdrop-blur-xl"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex flex-1 justify-start">
            <CommandPalette />
          </div>
          <NotificationsMenu />
          <LanguageSwitcher />
          <ThemeToggle />
          <div className="mx-1 h-6 w-px bg-border/70" />
          <AccountMenu />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
