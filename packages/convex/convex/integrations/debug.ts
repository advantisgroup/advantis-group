import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

/** Persist a raw third-party API response for inspection. Diagnostic only —
 * see the schema comment on `integrationsRawDebugLog`. */
export const logRaw = internalMutation({
  args: {
    integration: v.union(v.literal("clockodo")),
    endpoint: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, { integration, endpoint, payload }) => {
    await ctx.db.insert("integrationsRawDebugLog", {
      integration,
      endpoint,
      payload,
      at: Date.now(),
    });
  },
});
