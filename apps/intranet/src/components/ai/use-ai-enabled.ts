"use client";

import { useFeatureFlags } from "@/components/feature-flags/FeatureGate";
import { useHasCapability } from "@/components/providers/current-user";

/**
 * Whether AI is available to this person right now: switched on for the
 * workspace (`/admin/feature-flags`) and granted to them (the `use_ai`
 * capability, which managers and admins have by their tier).
 *
 * The flag is treated as on until proven otherwise, so a slow read never
 * blanks the AI affordances on a healthy deployment; the capability comes
 * from the already-loaded current user, so it's known immediately. What
 * actually decides is server-side — `aiRuns.apiStart` refuses to open a run
 * on either count — this only stops the app offering something that'd fail.
 */
export function useAiEnabled(): boolean {
  const flags = useFeatureFlags();
  const allowed = useHasCapability("use_ai");
  return allowed && (flags?.find((flag) => flag.key === "ai")?.enabled ?? true);
}
