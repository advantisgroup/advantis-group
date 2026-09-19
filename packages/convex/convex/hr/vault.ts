import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  serverMutation,
} from "../functions";
import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { type MutationCtx } from "../_generated/server";
import { hashPassword, verifyPassword } from "../activity/lib/crypto";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import {
  getCallerForAction,
  getUserByClerkId,
  isApplicantAreaMember,
  requireAdmin,
  requireApplicantAreaMember,
  requireUser,
} from "../lib/auth";
import {
  AREA_REVERIFY_LEVEL,
  availableMethodsFor,
  getOrDefaultPolicy,
  isAreaTrusted,
  isLegacyPasswordSunsetInForce,
  legacyPasswordSunsetDeadline,
} from "../lib/stepUp";
import { clearVaultPasswordForUser } from "./lib/vault";

/** How long a vault unlock lasts before the password must be re-entered. */
export const UNLOCK_DURATION_MS = 30 * 60 * 1000;

/** Whether the caller has set their own vault password yet, and whether
 * their unlock (if any) is still valid. Deliberately does NOT require the
 * vault to already be unlocked — this is what the lock screen itself reads
 * to decide what to show. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApplicantAreaMember(ctx);
    const passwordRow = await ctx.db
      .query("applicantVaultPasswords")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const unlockRow = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const unlocked = !!unlockRow && unlockRow.expiresAt > Date.now();
    const passkey = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    // `performUnlock` enforces this; here it only tells the gate to show a
    // step-up form instead of an unlock prompt that would fail.
    const areaTrusted = await isAreaTrusted(ctx, user._id, "applicant_vault");
    // Without a passkey the password is the only way in, so it never sunsets.
    const legacyPasswordSunsetDeadlineAt = passkey
      ? legacyPasswordSunsetDeadline(await getOrDefaultPolicy(ctx), "applicant_vault")
      : null;
    return {
      passwordIsSet: !!passwordRow,
      hasPasskey: !!passkey,
      unlocked,
      expiresAt: unlocked ? unlockRow.expiresAt : null,
      needsAreaStepUp: !areaTrusted,
      areaStepUpRequiredLevel: areaTrusted ? null : AREA_REVERIFY_LEVEL,
      areaStepUpAvailableMethods: areaTrusted
        ? []
        : await availableMethodsFor(ctx, user._id, AREA_REVERIFY_LEVEL, { includePasskey: true }),
      legacyPasswordSunsetDeadline: legacyPasswordSunsetDeadlineAt,
      passwordRetired:
        legacyPasswordSunsetDeadlineAt !== null && Date.now() > legacyPasswordSunsetDeadlineAt,
    };
  },
});

export const getPasswordRow = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    await ctx.db
      .query("applicantVaultPasswords")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
});

export const storePasswordHash = internalMutation({
  args: { userId: v.id("users"), hash: v.string() },
  handler: async (ctx, { userId, hash }) => {
    const existing = await ctx.db
      .query("applicantVaultPasswords")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { hash, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("applicantVaultPasswords", {
        userId,
        hash,
        updatedAt: Date.now(),
      });
    }
    // Rotating your own password invalidates your own existing unlock —
    // otherwise a stale session that unlocked with the old password would
    // keep access. Other members' unlocks are untouched: each password is
    // independent now.
    const unlock = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (unlock) await ctx.db.delete(unlock._id);
    const auditAt = Date.now();
    const auditAction = existing ? "vault_password_rotated" : "vault_password_set";
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: userId,
      action: auditAction,
      at: auditAt,
    });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: userId,
      action: auditAction,
      at: auditAt,
    });
  },
});

/** Set or rotate the caller's own vault password. Runs as an action so it
 * can use Web Crypto (PBKDF2) to hash, matching the tray-app debug
 * password's existing pattern. */
export const setPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const me = (await getCallerForAction(ctx))?.user;
    if (!me || !isApplicantAreaMember(me)) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    if (password.length < 8) {
      throw new ConvexError({
        code: "validation",
        message: "Password must be at least 8 characters",
      });
    }
    const hash = await hashPassword(password);
    await ctx.runMutation(internal.hr.vault.storePasswordHash, {
      userId: me._id,
      hash,
    });
  },
});

/** Shared by the password and passkey unlock paths. */
async function performUnlock(
  ctx: MutationCtx,
  userId: Id<"users">,
  action: "vault_unlocked" | "vault_unlocked_via_passkey",
): Promise<void> {
  // A lapsed area re-verification blocks every unlock, password or passkey.
  if (!(await isAreaTrusted(ctx, userId, "applicant_vault"))) {
    throw new ConvexError({
      code: "needs_area_step_up",
      message: "Re-verify your identity to continue.",
    });
  }
  const now = Date.now();
  const expiresAt = now + UNLOCK_DURATION_MS;
  const existing = await ctx.db
    .query("applicantVaultUnlocks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { unlockedAt: now, expiresAt });
  } else {
    await ctx.db.insert("applicantVaultUnlocks", {
      userId,
      unlockedAt: now,
      expiresAt,
    });
  }
  await ctx.db.insert("applicantAuditLog", { actorUserId: userId, action, at: now });
  await recordUnifiedAudit(ctx, { domain: "applicant", actorUserId: userId, action, at: now });
}

export const recordUnlock = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await performUnlock(ctx, userId, "vault_unlocked");
  },
});

/** Called by apps/api once it has verified the passkey assertion belongs to
 * `clerkUserId` (WebAuthn verification only runs there). */
export const apiUnlockViaPasskey = serverMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await getUserByClerkId(ctx, clerkUserId);
    if (!user || !isApplicantAreaMember(user)) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    await performUnlock(ctx, user._id, "vault_unlocked_via_passkey");
  },
});

/** Verify the caller's own vault password and, if correct, unlock it for
 * them. */
export const unlock = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const me = (await getCallerForAction(ctx))?.user;
    if (!me || !isApplicantAreaMember(me)) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    const row = await ctx.runQuery(internal.hr.vault.getPasswordRow, {
      userId: me._id,
    });
    if (!row) {
      throw new ConvexError({
        code: "not_configured",
        message: "You haven't set a password yet — set one first.",
      });
    }
    const ok = await verifyPassword(password, row.hash);
    if (!ok) {
      throw new ConvexError({
        code: "invalid_password",
        message: "Incorrect password",
      });
    }
    // Only checked after the password is right, so a guesser learns nothing.
    if (
      await ctx.runQuery(internal.hr.vault.checkLegacyPasswordSunset, {
        userId: me._id,
      })
    ) {
      throw new ConvexError({
        code: "legacy_password_sunset",
        message: "Password unlock has moved — use your passkey instead.",
      });
    }
    await ctx.runMutation(internal.hr.vault.recordUnlock, {
      userId: me._id,
    });
  },
});

export const checkLegacyPasswordSunset = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<boolean> => {
    const passkey = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!passkey) return false;
    return await isLegacyPasswordSunsetInForce(ctx, "applicant_vault");
  },
});

/** Re-lock immediately (e.g. a "lock now" button), instead of waiting for the
 * unlock to expire on its own. */
export const lock = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    const auditAt = Date.now();
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: user._id,
      action: "vault_locked",
      at: auditAt,
    });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: user._id,
      action: "vault_locked",
      at: auditAt,
    });
  },
});

/** Admin-only: forget a user's forgotten vault password, forcing them to set
 * a new one the next time they open Applicant Management. Deliberately
 * doesn't let the admin choose or see the new password — resetting only
 * clears the old one, it never hands the admin a way to impersonate the
 * user's unlock. */
export const resetPassword = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }
    await clearVaultPasswordForUser(ctx, userId);
    const auditAt = Date.now();
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: admin._id,
      action: "vault_password_reset_by_admin",
      target: target.email,
      at: auditAt,
    });
    await recordUnifiedAudit(ctx, {
      domain: "applicant",
      actorUserId: admin._id,
      action: "vault_password_reset_by_admin",
      target: target.email,
      at: auditAt,
    });
  },
});

/** Admin/delegate helper: for every member who currently has Applicant
 * Management access or delegate rights, whether they've set a vault
 * password yet — so the access panel can offer a reset only where one
 * exists. */
export const memberPasswordStatuses = query({
  args: {},
  handler: async (ctx) => {
    await requireApplicantAreaMember(ctx);
    const members = (await ctx.db.query("users").collect()).filter(
      (u) => u.status !== "removed" && isApplicantAreaMember(u),
    );
    const rows = await ctx.db.query("applicantVaultPasswords").collect();
    const setByUser = new Set(rows.map((r) => r.userId));
    return members.map((u) => ({
      userId: u._id,
      passwordIsSet: setByUser.has(u._id),
    }));
  },
});
