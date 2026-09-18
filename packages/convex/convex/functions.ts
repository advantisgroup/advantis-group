import {
  ConvexError,
  type GenericValidator,
  type ObjectType,
  type PropertyValidators,
  v,
} from "convex/values";
import type { ActionBuilder, MutationBuilder } from "convex/server";

import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import {
  action as rawAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation as rawMutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { assertServerKey, getCurrentUser } from "./lib/auth";
import { type FeatureFlagKey, isFeatureEnabled } from "./lib/featureFlags";

/**
 * The builders every module defines its functions with — import from here,
 * never from `_generated/server`.
 *
 * - `query`, `internalQuery`, `internalMutation`, `internalAction`: plain Convex.
 * - `mutation`, `action`: refuse to run while the caller is in sandbox mode
 *   (`sandboxSafeMutation` for the few writes that must not).
 * - `serverQuery`, `serverMutation`, `serverAction`: only for apps/api — they
 *   add a `serverKey` argument and check it before the handler runs.
 * - `gated*(flag)`: stop producing data while a feature flag is off.
 */
export { internalAction, internalMutation, internalQuery, query };

// --- Sandbox ----------------------------------------------------------------

const sandboxError = () =>
  new ConvexError({
    code: "sandbox_active",
    message: "Leave sandbox mode before making changes",
  });

async function assertNotSandboxed(ctx: MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user?.sandboxRole) throw sandboxError();
}

async function assertActionNotSandboxed(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return;
  const sandboxed = await ctx.runQuery(internal.sandbox.isActiveForClerkUser, {
    clerkUserId: identity.subject,
  });
  if (sandboxed) throw sandboxError();
}

type FunctionDefinition = {
  handler: (...args: any[]) => any;
  [key: string]: any;
};

/** Every browser-callable write goes through this guard. Server-key callers
 * have no Clerk identity, so integration and scheduled work stay unaffected. */
export const mutation = ((definition: FunctionDefinition) =>
  rawMutation({
    ...definition,
    handler: async (ctx, ...args) => {
      await assertNotSandboxed(ctx);
      return definition.handler(ctx, ...args);
    },
  })) as MutationBuilder<DataModel, "public">;

export const action = ((definition: FunctionDefinition) =>
  rawAction({
    ...definition,
    handler: async (ctx, ...args) => {
      await assertActionNotSandboxed(ctx);
      return definition.handler(ctx, ...args);
    },
  })) as ActionBuilder<DataModel, "public">;

/** A browser write that has to keep working in sandbox mode: signing in,
 * the presence heartbeat, and leaving the sandbox itself. */
export const sandboxSafeMutation = rawMutation;

// --- Server-to-server (apps/api) ---------------------------------------------

/** apps/api has already authenticated the real caller before reaching here;
 * the handler never sees `serverKey`. */
export function serverQuery<Args extends PropertyValidators, Output>(definition: {
  args: Args;
  returns?: GenericValidator;
  handler: (ctx: QueryCtx, args: ObjectType<Args>) => Output;
}) {
  const { args, handler, ...rest } = definition;
  return query({
    ...rest,
    args: { ...args, serverKey: v.string() },
    handler: (ctx, { serverKey, ...handlerArgs }) => {
      assertServerKey(serverKey);
      return handler(ctx, handlerArgs as ObjectType<Args>);
    },
  });
}

export function serverMutation<Args extends PropertyValidators, Output>(definition: {
  args: Args;
  returns?: GenericValidator;
  handler: (ctx: MutationCtx, args: ObjectType<Args>) => Output;
}) {
  const { args, handler, ...rest } = definition;
  return rawMutation({
    ...rest,
    args: { ...args, serverKey: v.string() },
    handler: (ctx, { serverKey, ...handlerArgs }) => {
      assertServerKey(serverKey);
      return handler(ctx, handlerArgs as ObjectType<Args>);
    },
  });
}

export function serverAction<Args extends PropertyValidators, Output>(definition: {
  args: Args;
  returns?: GenericValidator;
  handler: (ctx: ActionCtx, args: ObjectType<Args>) => Output;
}) {
  const { args, handler, ...rest } = definition;
  return rawAction({
    ...rest,
    args: { ...args, serverKey: v.string() },
    handler: (ctx, { serverKey, ...handlerArgs }) => {
      assertServerKey(serverKey);
      return handler(ctx, handlerArgs as ObjectType<Args>);
    },
  });
}

// --- Feature flags -------------------------------------------------------------

export function disabledFeatureError(key: FeatureFlagKey) {
  return new ConvexError({
    code: "feature_disabled" as const,
    key,
    message: `This is currently disabled by an administrator (${key}).`,
  });
}

/** Queries/mutations have `ctx.db` and can read the flag row directly. */
const checkDirect = (ctx: unknown, key: FeatureFlagKey) =>
  isFeatureEnabled(ctx as QueryCtx | MutationCtx, key);

/** Actions have no `ctx.db`, so they ask through a query. */
const checkViaQuery = (ctx: unknown, key: FeatureFlagKey) =>
  (ctx as ActionCtx).runQuery(internal.org.featureFlags.isEnabledInternal, { key });

/** Wraps a builder so every function it defines checks `key` first, keeping
 * the builder's exact type so `args`/`handler` inference is unchanged. Only
 * gate functions that *produce* data for the feature — reads and admin
 * tooling stay on so an admin can still fix things and switch it back on. */
function gate<Builder extends (config: never) => unknown>(
  builder: Builder,
  key: FeatureFlagKey,
  isEnabled: (ctx: unknown, key: FeatureFlagKey) => Promise<boolean>,
): Builder {
  return ((config: Record<string, unknown>) => {
    const { handler, ...rest } = config as {
      handler: (ctx: unknown, ...args: unknown[]) => unknown;
    };
    return builder({
      ...rest,
      handler: async (ctx: unknown, ...args: unknown[]) => {
        if (!(await isEnabled(ctx, key))) throw disabledFeatureError(key);
        return handler(ctx, ...args);
      },
    } as never);
  }) as unknown as Builder;
}

export const gatedMutation = (key: FeatureFlagKey): typeof mutation =>
  gate(mutation, key, checkDirect);
export const gatedAction = (key: FeatureFlagKey): typeof action => gate(action, key, checkViaQuery);
export const gatedInternalMutation = (key: FeatureFlagKey): typeof internalMutation =>
  gate(internalMutation, key, checkDirect);
export const gatedInternalAction = (key: FeatureFlagKey): typeof internalAction =>
  gate(internalAction, key, checkViaQuery);
