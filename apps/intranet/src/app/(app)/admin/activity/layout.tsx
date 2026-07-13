"use client";

import type { ReactNode } from "react";

import { TrademarkNotice } from "@/components/branding/TrademarkNotice";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useHasCapability } from "@/components/providers/current-user";

/**
 * Access scope for the ActivityTrack area. Manager+ by default; `useHasCapability`
 * also lets in an employee holding a custom role with `view_activity_admin`,
 * without promoting them to manager. The app shell + providers already wrap
 * everything via `(app)/layout.tsx`, so this only enforces access — it does not
 * recreate the shell.
 */
export default function ActivityLayout({ children }: { children: ReactNode }) {
  const hasActivityAdminAccess = useHasCapability("view_activity_admin");

  if (!hasActivityAdminAccess) {
    return <ForbiddenScreen />;
  }

  return (
    <>
      {children}
      <TrademarkNotice className="mx-auto max-w-5xl px-4 pb-8 pt-2 sm:px-6" />
    </>
  );
}
