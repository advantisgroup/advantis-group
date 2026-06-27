"use client";

import type { ReactNode } from "react";

import { useIsManager } from "@/components/providers/current-user";

/**
 * Access scope for the ActivityTrack area. Gated behind `useIsManager()`
 * (managers + admins), matching the rest of `/admin`. The app shell + providers
 * already wrap everything via `(app)/layout.tsx`, so this only enforces access —
 * it does not recreate the shell.
 */
export default function ActivityLayout({ children }: { children: ReactNode }) {
  const isManager = useIsManager();

  if (!isManager) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">403</p>
    );
  }

  return <>{children}</>;
}
