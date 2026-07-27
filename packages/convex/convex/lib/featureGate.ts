import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import { action, internalAction, internalMutation, mutation } from "../_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { FeatureFlagKey } from "../featureFlags";
import { isFeatureEnabled } from "../featureFlags";

/**
 * The Convex-side "middleware" for feature flags. Convex has no route
 * middleware concept — a function either runs or it doesn't — so this wraps
 * the function *builders* (`mutation`, `action`, …) instead of the
 * individual handlers: swap `mutation({...})` for
 * `gatedMutation("activitytrack")({...})` on a function that should stop
 * doing its job while the flag is off, and the check lives in one place
 * instead of being copy-pasted into every handler.
 *
 * Only wrap the functions that actually *produce* data for the feature
 * (ingest, state fusion, integration relays/pollers) — read-only queries and
 * admin management/config/migration tooling stay on so an admin can still
 * use `/activity` (they keep UI access via `FeatureGate`) to fix things and
 * re-enable it.
 */
export function disabledFeatureError(key: FeatureFlagKey): ConvexError<{
  code: "feature_disabled";
  key: FeatureFlagKey;
  message: string;
}> {
  return new ConvexError({
    code: "feature_disabled" as const,
    key,
    message: `This is currently disabled by an administrator (${key}).`,
  });
}

/**
 * Wraps a Convex function builder (`mutation`, `action`, `internalMutation`,
 * `internalAction`) so every function it defines checks `featureKey` first.
 * Generic pass-through: the returned builder keeps the exact call signature
 * of `builder`, so callers get the same `args`/`handler` type inference as
 * using the builder directly.
 */
function gate<Builder extends (config: never) => unknown>(
  builder: Builder,
  featureKey: FeatureFlagKey,
  checkEnabled: (ctx: unknown, featureKey: FeatureFlagKey) => Promise<boolean>,
): Builder {
  return ((config: Record<string, unknown>) => {
    const { handler, ...rest } = config as {
      handler: (ctx: unknown, ...args: unknown[]) => unknown;
    };
    return builder({
      ...rest,
      handler: async (ctx: unknown, ...args: unknown[]) => {
        if (!(await checkEnabled(ctx, featureKey))) {
          throw disabledFeatureError(featureKey);
        }
        return handler(ctx, ...args);
      },
    } as never);
  }) as unknown as Builder;
}

/** Queries/mutations have `ctx.db` and can check the flag row directly. */
const checkEnabledDirect = (ctx: unknown, featureKey: FeatureFlagKey): Promise<boolean> =>
  isFeatureEnabled(ctx as QueryCtx | MutationCtx, featureKey);

/** Actions have no `ctx.db` — they must go through `ctx.runQuery` instead. */
const checkEnabledViaQuery = (ctx: unknown, featureKey: FeatureFlagKey): Promise<boolean> =>
  (ctx as ActionCtx).runQuery(internal.featureFlags.isEnabledInternal, {
    key: featureKey,
  });

export const gatedMutation = (featureKey: FeatureFlagKey): typeof mutation =>
  gate(mutation, featureKey, checkEnabledDirect);
export const gatedAction = (featureKey: FeatureFlagKey): typeof action =>
  gate(action, featureKey, checkEnabledViaQuery);
export const gatedInternalMutation = (featureKey: FeatureFlagKey): typeof internalMutation =>
  gate(internalMutation, featureKey, checkEnabledDirect);
export const gatedInternalAction = (featureKey: FeatureFlagKey): typeof internalAction =>
  gate(internalAction, featureKey, checkEnabledViaQuery);
