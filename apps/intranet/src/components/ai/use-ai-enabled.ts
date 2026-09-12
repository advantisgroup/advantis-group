"use client";

import { useFeatureFlags } from "@/components/feature-flags/FeatureGate";

/**
 * Whether AI is switched on right now (`/admin/feature-flags`).
 *
 * Enabled until proven otherwise, so a slow flag read never blanks the AI
 * affordances on a healthy deployment. The switch that actually matters is
 * server-side — `aiRuns.apiStart` refuses to open a run while the flag is
 * off — this one only stops the app from offering something that would fail.
 */
export function useAiEnabled(): boolean {
  const flags = useFeatureFlags();
  return flags?.find((flag) => flag.key === "ai")?.enabled ?? true;
}
