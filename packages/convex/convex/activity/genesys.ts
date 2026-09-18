"use node";

import { v } from "convex/values";

import { gatedAction } from "../functions";
import { reportHealth, healthStatusOf, errMessage } from "./lib/integrationsShared";
import { fetchGenesysUserState, pushGenesys } from "./lib/genesys";

/** On-demand single-user Genesys sync (used by the dashboard /sync endpoint). Gated. */
export const syncGenesys = gatedAction("activitytrack")({
  args: {
    secret: v.string(),
    employeeId: v.string(),
    genesysUserId: v.string(),
  },
  handler: async (ctx, { secret, employeeId, genesysUserId }) => {
    if (secret !== process.env.ACTIVITYTRACK_SIGNAL_SECRET) {
      return { ok: false, error: "forbidden" as const };
    }
    try {
      const s = await fetchGenesysUserState(genesysUserId);
      await pushGenesys(ctx, employeeId, s);
      await reportHealth(ctx, "genesys", "ok");
      return { ok: true as const };
    } catch (err) {
      await reportHealth(ctx, "genesys", healthStatusOf(err), errMessage(err));
      return { ok: false, error: "genesys_unavailable" as const };
    }
  },
});
