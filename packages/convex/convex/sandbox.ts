import { v } from "convex/values";

import { internalQuery } from "./functions";
import { getUserByClerkId } from "./lib/auth";

/** Used by the public action wrapper before it starts work. */
export const isActiveForClerkUser = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await getUserByClerkId(ctx, clerkUserId);
    return user?.sandboxRole !== undefined;
  },
});
