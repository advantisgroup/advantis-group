import { sandboxedAction as action, sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { hashPassword, verifyPassword } from "./activity/lib/crypto";
import { recordUnifiedAudit } from "./lib/auditLogWrite";
import {
  getUserByClerkId,
  isApplicantAreaMember,
  requireAdmin,
  requireApplicantAreaMember,
  requireUser,
} from "./lib/auth";

function assertServerKey(serverKey: string): void {
  const expected = process.env.CONVEX_SERVER_KEY;
  if (!expected || serverKey !== expected) {
    throw new ConvexError({ code: "forbidden", message: "Invalid server key" });
  }
}

/** How long a vault unlock lasts before the password must be re-entered. */
export const UNLOCK_DURATION_MS = 30 * 60 * 1000;

/** Delete a user's own vault password + unlock, if any. Used both when an
 * admin resets a forgotten password and when access is revoked entirely —
 * a former member's password must not linger once they can no longer reach
 * the area it guards. Plain helper (not a Convex function) so callers in
 * `users.ts` can invoke it directly from within their own mutation. */
export async function clearVaultPasswordForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const passwordRow = await ctx.db
    .query("applicantVaultPasswords")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (passwordRow) await ctx.db.delete(passwordRow._id);

  const unlockRow = await ctx.db
    .query("applicantVaultUnlocks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (unlockRow) await ctx.db.delete(unlockRow._id);
}

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
    // Phase 4 of docs/future-features/21_auth-consolidation.md: the vault
    // gate offers a passkey unlock once the member has at least one
    // registered — the password stays as the fallback either way.
    const passkey = await ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    return {
      passwordIsSet: !!passwordRow,
      hasPasskey: !!passkey,
      unlocked,
      expiresAt: unlocked ? unlockRow.expiresAt : null,
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
    const me = await ctx.runQuery(api.users.me, {});
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
    await ctx.runMutation(internal.applicantVault.storePasswordHash, {
      userId: me._id,
      hash,
    });
  },
});

/** Shared by the password and passkey unlock paths — plain helper, not a
 * Convex function, so both `recordUnlock` (internalMutation, called from the
 * `unlock` action) and `apiUnlockViaPasskey` (a plain mutation, already
 * inside a transaction) can call it directly. `action` distinguishes how in
 * the audit trail without adding a second table. */
async function performUnlock(
  ctx: MutationCtx,
  userId: Id<"users">,
  action: "vault_unlocked" | "vault_unlocked_via_passkey",
): Promise<void> {
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

/** Server-key-gated like every other WebAuthn-adjacent Convex function
 * (`passkeys.ts`, `stepUp.ts`) — the actual assertion verification needs
 * `@simplewebauthn/server`, which only runs in `apps/api`; this just records
 * the outcome once that's already confirmed the assertion resolves to
 * `clerkUserId`'s own passkey. Phase 4 of
 * docs/future-features/21_auth-consolidation.md. */
export const apiUnlockViaPasskey = mutation({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  handler: async (ctx, { serverKey, clerkUserId }) => {
    assertServerKey(serverKey);
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
    const me = await ctx.runQuery(api.users.me, {});
    if (!me || !isApplicantAreaMember(me)) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to do that",
      });
    }
    const row = await ctx.runQuery(internal.applicantVault.getPasswordRow, {
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
    await ctx.runMutation(internal.applicantVault.recordUnlock, {
      userId: me._id,
    });
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
    const members = (await ctx.db.query("users").collect()).filter(isApplicantAreaMember);
    const rows = await ctx.db.query("applicantVaultPasswords").collect();
    const setByUser = new Set(rows.map((r) => r.userId));
    return members.map((u) => ({
      userId: u._id,
      passwordIsSet: setByUser.has(u._id),
    }));
  },
});
