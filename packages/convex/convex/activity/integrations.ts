"use node";

import { internalAction } from "../_generated/server";
import { api } from "../_generated/api";
import { signalSecret } from "./lib/integrationsShared";
import { pollGenesys } from "./genesys";
import { pollClockodo } from "./clockodo";

/**
 * Scheduled poll orchestrator. The per-source HTTP clients live in `genesys.ts`
 * and `clockodo.ts`; this file wires them together for the Convex cron. Each
 * source is isolated (its `poll*` helper try/catches and reports health), so one
 * integration being down never affects the other or the fused state.
 */
export const pollAll = internalAction({
  args: {},
  handler: async ctx => {
    const start = Date.now();
    const secret = signalSecret();
    const mappings = await ctx.runQuery(api.activity.state.mappings, {
      secret,
    });
    const genesysCount = mappings.filter(p => p.genesysUserId).length;
    const clockodoCount = mappings.filter(p => p.clockodoUserId).length;
    console.log(
      `[activity:poll] starting — ${mappings.length} mapped people (genesys=${genesysCount}, clockodo=${clockodoCount})`
    );
    await pollGenesys(ctx, mappings);
    await pollClockodo(ctx, secret, mappings);
    console.log(`[activity:poll] finished in ${Date.now() - start}ms`);
  },
});
