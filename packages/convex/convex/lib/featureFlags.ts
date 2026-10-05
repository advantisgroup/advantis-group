import { v } from "convex/values";

import { type Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Admin kill-switches for whole features (see AGENTS.md's "Publishing
 * Updates" section for how this plugs into the existing incidents/
 * maintenance feed). A missing `featureFlags` row means enabled — flags only
 * exist once someone has toggled them off at least once.
 *
 * Each entry here is a single-file addition: a label, a premade disable
 * message, and wherever the feature's own mutations/actions call
 * `isFeatureEnabled` to stop doing work while it's off.
 *
 * This is the only list of flag keys — the intranet derives its
 * `FeatureFlagKey` type from `setFlag`'s args.
 */
// A key that's no longer listed here (ActivityTrack's "activitytrack") can
// still have a row in `featureFlags`; readers skip rows not in the registry.
export const FEATURE_FLAG_KEYS = ["chat", "ai", "marketingSubmissions"] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
export const FEATURE_FLAG_REGISTRY: Record<
  FeatureFlagKey,
  { label: string; premadeReason: string }
> = {
  chat: {
    label: "Chat",
    premadeReason:
      "Chat has been disabled by an administrator. Sending and receiving messages is temporarily unavailable while it's disabled.",
  },
  ai: {
    label: "AI",
    premadeReason:
      "AI has been disabled by an administrator. Nothing new can be sent to the model while it's off; runs that already finished stay where they are.",
  },
  // read by apps/marketing through marketing/forms.ts, takes effect without a redeploy
  marketingSubmissions: {
    label: "Website contact forms",
    premadeReason:
      "The contact forms on the website have been closed by an administrator. Visitors can still leave their email to be told when they reopen.",
  },
};

export const featureKeyValidator = v.union(
  v.literal(FEATURE_FLAG_KEYS[0]),
  ...FEATURE_FLAG_KEYS.slice(1).map((key) => v.literal(key)),
);

export async function getFlagRow(
  ctx: QueryCtx | MutationCtx,
  key: FeatureFlagKey,
): Promise<Doc<"featureFlags"> | null> {
  return await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/**
 * Server-side gate — call from any mutation/action that should stop
 * persisting or acting while a feature is off. Defaults to enabled.
 */
export async function isFeatureEnabled(
  ctx: QueryCtx | MutationCtx,
  key: FeatureFlagKey,
): Promise<boolean> {
  const row = await getFlagRow(ctx, key);
  return row?.enabled ?? true;
}
