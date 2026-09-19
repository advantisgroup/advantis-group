import {
  ConvexError,
  type GenericValidator,
  type ObjectType,
  type PropertyValidators,
  v,
} from "convex/values";
import type { ActionBuilder, MutationBuilder } from "convex/server";
import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";

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
import { type Capability, assertServerKey, getCurrentUser } from "./lib/auth";
import {
  Caller,
  type CallerData,
  type RoleRequirement,
  requireServerCaller,
  requireSessionCaller,
} from "./lib/caller";
import { type FeatureFlagKey, isFeatureEnabled } from "./lib/featureFlags";
import { requireVaultUnlocked } from "./hr/lib/access";

/**
 * The builders every module defines its functions with — import from here,
 * never from `_generated/server`.
 *
 * - `userQuery`, `userMutation`, `userAction`: a signed-in, active person.
 *   The handler gets `ctx.caller`; pass `role: "manager" | "admin"` or
 *   `can: <capability>` to require more before it runs. Writes refuse to run
 *   in sandbox mode.
 * - `serverUserQuery`, `serverUserMutation`, `serverUserAction`: the same,
 *   for apps/api — they take `serverKey` + `clerkUserId`, check the key and
 *   resolve the person apps/api already signed in.
 * - `serverQuery`, `serverMutation`, `serverAction`: apps/api calls that
 *   aren't on behalf of a person (webhooks, pollers).
 * - `query`, `internalQuery`, `internalMutation`, `internalAction`: plain Convex.
 * - `mutation`, `action`: plain Convex that refuses to run in sandbox mode
 *   (`sandboxSafeMutation` for the few writes that must not).
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
  const sandboxed = await ctx.runQuery(internal.people.sandbox.isActiveForClerkUser, {
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

// --- Callers ------------------------------------------------------------------

type Requirement = {
  role?: RoleRequirement;
  can?: Capability;
  /** Applicant Management: `access` and `delegate` also need the vault
   *  unlocked; `member` doesn't, for the vault's own unlock screens. */
  applicant?: "access" | "delegate" | "member";
};

type CallerInput = { ctx: { caller: Caller }; args: Record<string, never> };

function check(caller: Caller, { role, can, applicant }: Requirement): CallerInput {
  if (role) caller.require(role);
  if (can) caller.require(can);
  if (applicant === "access") caller.require(caller.hasApplicantAccess);
  if (applicant === "delegate") caller.require(caller.isApplicantDelegate);
  if (applicant === "member") caller.require(caller.isApplicantAreaMember);
  return { ctx: { caller }, args: {} };
}

async function checkWithVault(
  ctx: QueryCtx | MutationCtx,
  caller: Caller,
  requirement: Requirement,
): Promise<CallerInput> {
  const input = check(caller, requirement);
  if (requirement.applicant === "access" || requirement.applicant === "delegate") {
    await requireVaultUnlocked(ctx, caller.id);
  }
  return input;
}

function refuseSandbox(caller: Caller): Caller {
  if (caller.sandboxed) throw sandboxError();
  return caller;
}

export const userQuery = customQuery(query, {
  args: {},
  input: async (ctx, _args, requirement: Requirement) =>
    checkWithVault(ctx, await requireSessionCaller(ctx), requirement),
});

export const userMutation = customMutation(rawMutation, {
  args: {},
  input: async (ctx, _args, requirement: Requirement) =>
    checkWithVault(ctx, refuseSandbox(await requireSessionCaller(ctx)), requirement),
});

export const userAction = customAction(rawAction, {
  args: {},
  input: async (ctx, _args, requirement: Requirement): Promise<CallerInput> => {
    const data: CallerData | null = await ctx.runQuery(internal.people.users.callerForAction, {});
    if (!data) throw new ConvexError({ code: "unauthenticated", message: "Not signed in" });
    return check(refuseSandbox(Caller.fromJSON(data)), requirement);
  },
});

const serverCallerArgs = { serverKey: v.string(), clerkUserId: v.string() };

export const serverUserQuery = customQuery(query, {
  args: serverCallerArgs,
  input: async (ctx, { serverKey, clerkUserId }, requirement: Requirement) => {
    assertServerKey(serverKey);
    return checkWithVault(ctx, await requireServerCaller(ctx, clerkUserId), requirement);
  },
});

export const serverUserMutation = customMutation(rawMutation, {
  args: serverCallerArgs,
  input: async (ctx, { serverKey, clerkUserId }, requirement: Requirement) => {
    assertServerKey(serverKey);
    return checkWithVault(ctx, await requireServerCaller(ctx, clerkUserId), requirement);
  },
});

export const serverUserAction = customAction(rawAction, {
  args: serverCallerArgs,
  input: async (
    ctx,
    { serverKey, clerkUserId },
    requirement: Requirement,
  ): Promise<CallerInput> => {
    assertServerKey(serverKey);
    const data: CallerData | null = await ctx.runQuery(internal.people.users.callerForClerkUser, {
      clerkUserId,
    });
    if (!data) throw new ConvexError({ code: "not_found", message: "User not found" });
    return check(Caller.fromJSON(data), requirement);
  },
});

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
export const gatedUserMutation = (key: FeatureFlagKey): typeof userMutation =>
  gate(userMutation, key, checkDirect);
export const gatedAction = (key: FeatureFlagKey): typeof action => gate(action, key, checkViaQuery);
export const gatedInternalMutation = (key: FeatureFlagKey): typeof internalMutation =>
  gate(internalMutation, key, checkDirect);
export const gatedInternalAction = (key: FeatureFlagKey): typeof internalAction =>
  gate(internalAction, key, checkViaQuery);
