import { sandboxedMutation as mutation } from "./lib/sandbox";
import { v } from "convex/values";

import { type Doc } from "./_generated/dataModel";
import { internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";
import { appendTimeline, insertUpdate } from "./updates";

/**
 * Admin kill-switches for whole features (see AGENTS.md's "Publishing
 * Updates" section for how this plugs into the existing incidents/
 * maintenance feed). A missing `featureFlags` row means enabled — flags only
 * exist once someone has toggled them off at least once.
 *
 * Each entry here is a single-file addition: a label, a premade disable
 * message, and wherever the feature's own mutations/actions call
 * `isFeatureEnabled` to stop doing work while it's off.
 *
 * `FEATURE_FLAG_KEYS` is intentionally duplicated in `@advantis/types` (for
 * the intranet client) rather than imported from there — same reason
 * `schema.ts`'s `roleValidator` redeclares `Role` instead of importing it:
 * this directory is bundled standalone for the Convex deployment and
 * doesn't depend on other workspace packages. Keep both lists in sync by hand.
 */
export const FEATURE_FLAG_KEYS = ["activitytrack", "chat"] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
export const FEATURE_FLAG_REGISTRY: Record<
  FeatureFlagKey,
  { label: string; premadeReason: string }
> = {
  activitytrack: {
    label: "ActivityTrack",
    premadeReason:
      "ActivityTrack has been disabled by an administrator. Desktop, phone, and time-tracking activity signals will not be recorded or shown while it's disabled.",
  },
  chat: {
    label: "Chat",
    premadeReason:
      "Chat has been disabled by an administrator. Sending and receiving messages is temporarily unavailable while it's disabled.",
  },
};

const featureKeyValidator = v.union(
  v.literal(FEATURE_FLAG_KEYS[0]),
  ...FEATURE_FLAG_KEYS.slice(1).map((key) => v.literal(key)),
);

async function getFlagRow(
  ctx: QueryCtx | MutationCtx,
  key: FeatureFlagKey,
): Promise<Doc<"featureFlags"> | null> {
  return await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/**
 * Server-side gate — call from any mutation/action that should stop
 * persisting or acting while a feature is off. Defaults to enabled.
 */
export async function isFeatureEnabled(
  ctx: QueryCtx | MutationCtx,
  key: FeatureFlagKey,
): Promise<boolean> {
  const row = await getFlagRow(ctx, key);
  return row?.enabled ?? true;
}

/** Actions can't touch `ctx.db` directly — this is what `gatedAction`/`gatedInternalAction` call via `ctx.runQuery`. */
export const isEnabledInternal = internalQuery({
  args: { key: featureKeyValidator },
  handler: async (ctx, args) => isFeatureEnabled(ctx, args.key as FeatureFlagKey),
});

/** Reactive read for UI gating (FeatureGate) and the admin toggle panel. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
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
export const setFlag = mutation({
  args: {
    key: featureKeyValidator,
    enabled: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
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
