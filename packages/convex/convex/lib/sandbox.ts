import { ConvexError } from "convex/values";
import type { ActionBuilder, MutationBuilder } from "convex/server";

import type { DataModel } from "../_generated/dataModel";
import {
  action as baseAction,
  mutation as baseMutation,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { getCurrentUser } from "./auth";

const sandboxError = () =>
  new ConvexError({
    code: "sandbox_active",
    message: "Leave sandbox mode before making changes",
  });

async function assertMutationAllowed(ctx: MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user?.sandboxRole) throw sandboxError();
}

async function assertActionAllowed(ctx: ActionCtx) {
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
export const sandboxedMutation = ((definition: FunctionDefinition) =>
  baseMutation({
    ...definition,
    handler: async (ctx, ...args) => {
      await assertMutationAllowed(ctx);
      return definition.handler(ctx, ...args);
    },
  })) as MutationBuilder<DataModel, "public">;

export const sandboxedAction = ((definition: FunctionDefinition) =>
  baseAction({
    ...definition,
    handler: async (ctx, ...args) => {
      await assertActionAllowed(ctx);
      return definition.handler(ctx, ...args);
    },
  })) as ActionBuilder<DataModel, "public">;
