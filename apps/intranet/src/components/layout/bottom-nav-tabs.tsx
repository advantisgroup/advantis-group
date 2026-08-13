"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import Link from "next/link";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface BottomNavLinkTab {
  value: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

interface BottomNavActionTab {
  value: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

export type BottomNavTab = BottomNavLinkTab | BottomNavActionTab;

interface BottomNavTabsState {
  tabs: BottomNavTab[] | null;
  activeValue: string | null;
}

interface BottomNavTabsContextValue extends BottomNavTabsState {
  setTabs: (tabs: BottomNavTab[] | null, activeValue: string | null) => void;
}

const BottomNavTabsContext = createContext<BottomNavTabsContextValue | null>(null);

/**
 * Lets a page-level tab bar (e.g. `RouteTabs`) hand its tabs to the global
 * mobile `BottomNav` instead of rendering its own dropdown — so on mobile,
 * "the bottom nav" really does become the tab switcher rather than a
 * separate floating control competing for thumb-zone space.
 */
export function BottomNavTabsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BottomNavTabsState>({
    tabs: null,
    activeValue: null,
  });
  const setTabs = useCallback(
    (tabs: BottomNavTab[] | null, activeValue: string | null) => setState({ tabs, activeValue }),
    [],
  );

  return (
    <BottomNavTabsContext.Provider
      value={{
        ...state,
        setTabs,
      }}
    >
      {children}
    </BottomNavTabsContext.Provider>
  );
}

export function useBottomNavTabs(): BottomNavTabsContextValue {
  const ctx = useContext(BottomNavTabsContext);
  if (!ctx) {
    throw new Error("useBottomNavTabs must be used within BottomNavTabsProvider");
  }
  return ctx;
}

export function BottomNavTabButtons({
  tabs,
  activeValue,
  layoutId,
}: {
  tabs: BottomNavTab[];
  activeValue: string | null;
  layoutId: string;
}) {
  return (
    <>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.value === activeValue;
        const className = cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        );
        const content = (
          <>
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <Icon className="relative z-10 size-4" />
          </>
        );

        if ("href" in tab) {
          return (
            <Link
              key={tab.value}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={className}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={tab.value}
            type="button"
            aria-label={tab.label}
            aria-pressed={active}
            onClick={tab.onClick}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </>
  );
}
