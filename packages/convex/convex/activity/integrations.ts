"use node";

import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { signalSecret } from "./lib/integrationsShared";
import { appError } from "./lib/errors";
import { pollGenesys } from "./genesys";
import { pollClockodo } from "./clockodo";

/**
 * Scheduled poll orchestrator. The per-source HTTP clients live in `genesys.ts`
 * and `clockodo.ts`; this file wires them together for the Convex cron. Each
 * source is isolated (its `poll*` helper try/catches and reports health), so one
 * integration being down never affects the other or the fused state.
 */
async function runPollAll(ctx: ActionCtx): Promise<void> {
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
}

export const pollAll = internalAction({
  args: {},
  handler: async ctx => {
    await runPollAll(ctx);
  },
});

/**
 * Settings → Troubleshooting: run the full Genesys + Clockodo poll right now
 * instead of waiting for the next scheduled one — the first thing to reach for
 * when a live state looks stuck or stale. Manager+, gated by resolving the
 * caller via `api.users.me` (actions have no direct db access).
 */
export const troubleshootSyncNow = action({
  args: {},
  handler: async ctx => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me || (me.role !== "admin" && me.role !== "manager")) {
      throw appError("auth.forbidden", "Forbidden: requires manager role");
    }
    await runPollAll(ctx);
    return { ok: true as const };
  },
});
