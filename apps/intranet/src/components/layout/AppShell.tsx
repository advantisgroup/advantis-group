"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 border-r bg-card shadow-xl">
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
            "sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur"
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
          <div className="flex-1" />
          <NotificationsMenu />
          <LanguageSwitcher />
          <ThemeToggle />
          <AccountMenu />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
