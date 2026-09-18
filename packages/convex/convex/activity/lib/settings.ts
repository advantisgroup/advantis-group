import { type MutationCtx, type QueryCtx } from "../../_generated/server";

/**
 * Operational configuration, persisted as individual `activitySettings` rows.
 * `readConfig` merges stored overrides onto the defaults so every consumer
 * reads one coherent shape.
 */
export const CONFIG_KEYS = {
  inactivityThresholdSeconds: "config.inactivityThresholdSeconds",
  offlineThresholdSeconds: "config.offlineThresholdSeconds",
  retentionDays: "config.retentionDays",
} as const;

export interface AppConfig {
  inactivityThresholdSeconds: number;
  offlineThresholdSeconds: number;
  retentionDays: number;
}

export const CONFIG_DEFAULTS: AppConfig = {
  inactivityThresholdSeconds: 300,
  // Must stay above the desktop agent's keepalive interval (180s, see
  // tracker.rs in ActivityTrack) with margin, or "online" flickers offline
  // between keepalives. Kept equal to MAX_ATTRIBUTION_MS in ingest.ts.
  offlineThresholdSeconds: 360,
  retentionDays: 90,
};

/** Read the merged operational config (defaults + any stored overrides). */
export async function readConfig(ctx: QueryCtx | MutationCtx): Promise<AppConfig> {
  const out: AppConfig = { ...CONFIG_DEFAULTS };
  for (const [field, key] of Object.entries(CONFIG_KEYS) as [keyof AppConfig, string][]) {
    const row = await ctx.db
      .query("activitySettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) {
      const n = Number(row.value);
      if (Number.isFinite(n)) out[field] = n;
    }
  }
  return out;
}
