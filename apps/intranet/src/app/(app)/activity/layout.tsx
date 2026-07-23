"use client";

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { TrademarkNotice } from "@/components/branding/TrademarkNotice";
import { FeatureGate } from "@/components/feature-flags/FeatureGate";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useHasCapability } from "@/components/providers/current-user";

/**
 * Access scope for the ActivityTrack area. Manager+ by default; `useHasCapability`
 * also lets in an employee holding a custom role with `view_activity_admin`,
 * without promoting them to manager. The app shell + providers already wrap
 * everything via `(app)/layout.tsx`, so this only enforces access — it does not
 * recreate the shell. Beyond per-user access, the whole area is also subject
 * to the `activitytrack` feature flag — see `FeatureGate`.
 */
export default function ActivityLayout({ children }: { children: ReactNode }) {
  const hasActivityAdminAccess = useHasCapability("view_activity_admin");
  const tNav = useTranslations("Nav");

  if (!hasActivityAdminAccess) {
    return <ForbiddenScreen />;
  }

  return (
    <FeatureGate featureKey="activitytrack" label={tNav("activity")}>
      {children}
      <TrademarkNotice className="mx-auto max-w-5xl px-4 pb-8 pt-2 sm:px-6" />
    </FeatureGate>
  );
}
