import { ConvexError, v } from "convex/values";

import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { hashPassword, verifyPassword } from "./activity/lib/crypto";
import {
  requireAdmin,
  requireApplicantAreaMember,
  requireUser,
} from "./lib/auth";

/** How long a vault unlock lasts before the password must be re-entered. */
export const UNLOCK_DURATION_MS = 30 * 60 * 1000;

/** Whether the shared vault password has been configured yet, and whether the
 * current user's unlock (if any) is still valid. Deliberately does NOT
 * require the vault to already be unlocked — this is what the lock screen
 * itself reads to decide what to show. */
export const status = query({
  args: {},
  handler: async ctx => {
    const user = await requireApplicantAreaMember(ctx);
    const passwordRow = await ctx.db.query("applicantVaultPassword").first();
    const unlockRow = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .unique();
    const unlocked = !!unlockRow && unlockRow.expiresAt > Date.now();
    return {
      passwordIsSet: !!passwordRow,
      unlocked,
      expiresAt: unlocked ? unlockRow.expiresAt : null,
      isAdmin: user.role === "admin",
    };
  },
});

export const getPasswordRow = internalQuery({
  args: {},
  handler: async ctx => await ctx.db.query("applicantVaultPassword").first(),
});

export const storePasswordHash = internalMutation({
  args: { hash: v.string(), updatedByUserId: v.id("users") },
  handler: async (ctx, { hash, updatedByUserId }) => {
    const existing = await ctx.db.query("applicantVaultPassword").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        hash,
        updatedByUserId,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("applicantVaultPassword", {
        hash,
        updatedByUserId,
        updatedAt: Date.now(),
      });
    }
    // Rotating the password invalidates every existing unlock — otherwise
    // someone who unlocked with the old password would keep access.
    const unlocks = await ctx.db.query("applicantVaultUnlocks").collect();
    for (const u of unlocks) await ctx.db.delete(u._id);
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: updatedByUserId,
      action: existing ? "vault_password_rotated" : "vault_password_set",
      at: Date.now(),
    });
  },
});

/** Admin-only: set or rotate the shared vault password. Runs as an action so
 * it can use Web Crypto (PBKDF2) to hash, matching the tray-app debug
 * password's existing pattern. */
export const setPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me || me.role !== "admin") {
      throw new ConvexError({
        code: "forbidden",
        message: "Requires admin role",
      });
    }
    if (password.length < 8) {
      throw new ConvexError({
        code: "validation",
        message: "Password must be at least 8 characters",
      });
    }
    const hash = await hashPassword(password);
    await ctx.runMutation(internal.applicantVault.storePasswordHash, {
      hash,
      updatedByUserId: me._id,
    });
  },
});

export const recordUnlock = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    const expiresAt = now + UNLOCK_DURATION_MS;
    const existing = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", q => q.eq("userId", userId))
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
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: userId,
      action: "vault_unlocked",
      at: now,
    });
  },
});

/** Verify the vault password and, if correct, unlock it for the caller. */
export const unlock = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const me = await ctx.runQuery(api.users.me, {});
    if (
      !me ||
      (me.role !== "admin" &&
        !me.applicantAccess &&
        !me.applicantAccessDelegate)
    ) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    const row = await ctx.runQuery(internal.applicantVault.getPasswordRow, {});
    if (!row) {
      throw new ConvexError({
        code: "not_configured",
        message: "No vault password has been set yet — ask an admin.",
      });
    }
    const ok = await verifyPassword(password, row.hash);
    if (!ok) {
      throw new ConvexError({
        code: "invalid_password",
        message: "Incorrect password",
      });
    }
    await ctx.runMutation(internal.applicantVault.recordUnlock, {
      userId: me._id,
    });
  },
});

/** Re-lock immediately (e.g. a "lock now" button), instead of waiting for the
 * unlock to expire on its own. */
export const lock = mutation({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("applicantVaultUnlocks")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("applicantAuditLog", {
      actorUserId: user._id,
      action: "vault_locked",
      at: Date.now(),
    });
  },
});

/** Admin-only helper to grab who last set the password, for a small "set by /
 * updated at" hint in the admin UI. */
export const passwordInfo = query({
  args: {},
  handler: async ctx => {
    await requireAdmin(ctx);
    const row = await ctx.db.query("applicantVaultPassword").first();
    if (!row) return null;
    const updatedBy = await ctx.db.get(row.updatedByUserId);
    return {
      updatedAt: row.updatedAt,
      updatedByName: updatedBy
        ? [updatedBy.firstName, updatedBy.lastName].filter(Boolean).join(" ") ||
          updatedBy.email
        : null,
    };
  },
});
