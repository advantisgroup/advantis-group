"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

export interface BottomNavTab {
  value: string;
  href?: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
}

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
