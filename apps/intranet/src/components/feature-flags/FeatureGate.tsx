"use client";

import type { ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { type FunctionArgs } from "convex/server";

import { FeatureDisabledScreen } from "@/components/layout/FeatureDisabledScreen";
import { useIsAdmin } from "@/components/providers/current-user";

/** Taken from the Convex API so the list of flags only lives in `featureFlags.ts`. */
export type FeatureFlagKey = FunctionArgs<typeof api.org.featureFlags.setFlag>["key"];

/** Reactive read of every feature flag's current state. */
export function useFeatureFlags() {
  return useQuery(api.org.featureFlags.list);
}

/**
 * Wraps a route's content and swaps it for `FeatureDisabledScreen` when
 * `featureKey` is off, except for admins — they always keep access so they
 * can go re-enable it from `/admin/feature-flags`. `label` is the
 * already-translated display name (callers typically pull it from the `Nav`
 * namespace, e.g. `t("chat")`, so the same product name is
 * used everywhere instead of duplicating it here).
 */
export function FeatureGate({
  featureKey,
  label,
  children,
}: {
  featureKey: FeatureFlagKey;
  label: string;
  children: ReactNode;
}) {
  const flags = useFeatureFlags();
  const isAdmin = useIsAdmin();

  if (flags === undefined) return null;

  const flag = flags.find((f) => f.key === featureKey);
  if (flag && !flag.enabled && !isAdmin) {
    return <FeatureDisabledScreen label={label} reason={flag.reason} />;
  }

  return <>{children}</>;
}
