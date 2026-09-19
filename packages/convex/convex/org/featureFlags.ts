import { internalQuery, query, userMutation, userQuery } from "../functions";
import { v } from "convex/values";
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_REGISTRY,
  featureKeyValidator,
  type FeatureFlagKey,
  getFlagRow,
  isFeatureEnabled,
} from "../lib/featureFlags";
import { appendTimeline, insertUpdate } from "../updates/lib/updates";

/** Actions can't touch `ctx.db` directly — this is what `gatedAction`/`gatedInternalAction` call via `ctx.runQuery`. */
export const isEnabledInternal = internalQuery({
  args: { key: featureKeyValidator },
  handler: async (ctx, args) => isFeatureEnabled(ctx, args.key as FeatureFlagKey),
});

/** Reactive read for UI gating (FeatureGate) and the admin toggle panel. */
export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("featureFlags").collect();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return FEATURE_FLAG_KEYS.map((key) => {
      const row = byKey.get(key);
      const enabled = row?.enabled ?? true;
      return {
        key,
        label: FEATURE_FLAG_REGISTRY[key].label,
        premadeReason: FEATURE_FLAG_REGISTRY[key].premadeReason,
        enabled,
        reason: enabled ? undefined : row?.reason,
        updatedAt: row?.updatedAt,
      };
    });
  },
});

/**
 * Enable or disable a feature. Disabling posts a new Update (premade or
 * custom `reason`); re-enabling posts a follow-up on that same Update
 * instead of a second post, so toggling isn't spammy. Admin only.
 */
export const setFlag = userMutation({
  role: "admin",
  args: {
    key: featureKeyValidator,
    enabled: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = ctx.caller.user;
    const key = args.key as FeatureFlagKey;
    const meta = FEATURE_FLAG_REGISTRY[key];
    const existing = await getFlagRow(ctx, key);
    const now = Date.now();

    if (args.enabled) {
      if (!existing || existing.enabled) return { ok: true };
      await ctx.db.patch(existing._id, {
        enabled: true,
        reason: undefined,
        updatedAt: now,
        updatedByUserId: me._id,
      });
      if (existing.updateId) {
        await appendTimeline(ctx, existing.updateId, {
          authorUserId: me._id,
          status: "completed",
          message: args.reason?.trim() || `${meta.label} has been re-enabled.`,
        });
      }
      return { ok: true };
    }

    if (existing?.enabled === false) return { ok: true };

    const reason = args.reason?.trim() || meta.premadeReason;
    const updateId = await insertUpdate(ctx, {
      type: "maintenance",
      title: `${meta.label} disabled`,
      summary: reason.length > 140 ? `${reason.slice(0, 137)}...` : reason,
      bodyFormat: "markdown",
      body: reason,
      authorUserId: me._id,
      audience: { kind: "all" },
      affectedSystems: [meta.label],
      status: "in_progress",
      emailRequested: false,
      source: "system",
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: false,
        reason,
        updatedAt: now,
        updatedByUserId: me._id,
        updateId,
      });
    } else {
      await ctx.db.insert("featureFlags", {
        key,
        enabled: false,
        reason,
        updatedAt: now,
        updatedByUserId: me._id,
        updateId,
      });
    }
    return { ok: true };
  },
});
