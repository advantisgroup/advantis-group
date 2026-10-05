import { internalQuery, userMutation, userQuery } from "../functions";
import { v } from "convex/values";
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_REGISTRY,
  featureKeyValidator,
  type FeatureFlagKey,
  getFlagRow,
  isFeatureEnabled,
} from "../lib/featureFlags";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appendTimeline, insertUpdate } from "../updates/lib/updates";
import { displayName } from "../lib/users";

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
    return await Promise.all(
      FEATURE_FLAG_KEYS.map(async (key) => {
        const row = byKey.get(key);
        const enabled = row?.enabled ?? true;
        return {
          key,
          label: FEATURE_FLAG_REGISTRY[key].label,
          premadeReason: FEATURE_FLAG_REGISTRY[key].premadeReason,
          enabled,
          reason: enabled ? undefined : row?.reason,
          // off but nobody told yet (or the update was deleted) — the admin panel offers to post it now
          hasUpdate: await updateLives(ctx, row?.updateId),
          updatedAt: row?.updatedAt,
        };
      }),
    );
  },
});

/**
 * The extra context the flags page shows next to each switch: who flipped it,
 * the update people are reading, and for the website forms how many visitors
 * are waiting to hear they're back. Kept out of `list`, which every page
 * subscribes to through FeatureGate. Admin only.
 */
export const details = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("featureFlags").collect()).filter(
      (row) => row.key in FEATURE_FLAG_REGISTRY,
    );
    const waiting = rows.some((row) => row.key === "marketingSubmissions" && !row.enabled)
      ? (await ctx.db.query("notifyEmails").collect()).length
      : 0;
    return await Promise.all(
      rows.map(async (row) => {
        const by = await ctx.db.get(row.updatedByUserId);
        const live = await updateLives(ctx, row.updateId);
        return {
          key: row.key,
          updatedByName: by ? displayName(by) : null,
          updateId: live ? row.updateId : null,
          waiting: row.key === "marketingSubmissions" ? waiting : 0,
        };
      }),
    );
  },
});

/** A deleted update reads as missing, so it no longer counts as posted. */
async function updateLives(ctx: QueryCtx, updateId: Id<"updates"> | undefined) {
  return updateId ? (await ctx.db.get(updateId)) !== null : false;
}

/** The "X disabled" maintenance Update everyone sees. */
async function postDisabledUpdate(
  ctx: MutationCtx,
  key: FeatureFlagKey,
  reason: string,
  authorUserId: Id<"users">,
) {
  const meta = FEATURE_FLAG_REGISTRY[key];
  return await insertUpdate(ctx, {
    type: "maintenance",
    title: `${meta.label} disabled`,
    summary: reason.length > 140 ? `${reason.slice(0, 137)}...` : reason,
    bodyFormat: "markdown",
    body: reason,
    authorUserId,
    audience: { kind: "all" },
    affectedSystems: [meta.label],
    status: "in_progress",
    emailRequested: false,
    source: "system",
  });
}

/**
 * Enable or disable a feature. Disabling posts a new Update (premade or
 * custom `reason`) only when `postUpdate` is true — otherwise it can still be
 * posted later with `postFlagUpdate`. Re-enabling posts a follow-up on that
 * same Update instead of a second post, so toggling isn't spammy. Admin only.
 */
export const setFlag = userMutation({
  role: "admin",
  args: {
    key: featureKeyValidator,
    enabled: v.boolean(),
    reason: v.optional(v.string()),
    postUpdate: v.optional(v.boolean()),
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
      // the forms promised the notify list a mail when they came back
      if (key === "marketingSubmissions") {
        await ctx.scheduler.runAfter(0, internal.marketing.mail.sendFormsReopened, {});
      }
      return { ok: true };
    }

    if (existing?.enabled === false) return { ok: true };

    const reason = args.reason?.trim() || meta.premadeReason;
    const updateId = args.postUpdate
      ? await postDisabledUpdate(ctx, key, reason, me._id)
      : undefined;

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

/**
 * Posts the Update for a feature that was disabled without one. The re-enable
 * follow-up then lands on it like it would have otherwise. Admin only.
 */
export const postFlagUpdate = userMutation({
  role: "admin",
  args: {
    key: featureKeyValidator,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = args.key as FeatureFlagKey;
    const existing = await getFlagRow(ctx, key);
    if (!existing || existing.enabled || (await updateLives(ctx, existing.updateId))) {
      return { ok: true };
    }

    const reason =
      args.reason?.trim() || existing.reason || FEATURE_FLAG_REGISTRY[key].premadeReason;
    const updateId = await postDisabledUpdate(ctx, key, reason, ctx.caller.user._id);
    await ctx.db.patch(existing._id, { reason, updateId });
    return { ok: true };
  },
});
