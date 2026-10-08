import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { serverUserMutation, serverUserQuery, userMutation, userQuery } from "../functions";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import { displayName } from "../lib/users";
import { canUseMail } from "./lib/access";

async function accountFor(
  ctx: { db: QueryCtx["db"] },
  userId: Id<"users">,
): Promise<Doc<"mailAccounts"> | null> {
  return ctx.db
    .query("mailAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** Drives the header button: null hides it entirely. */
export const myStatus = userQuery({
  args: {},
  handler: async (ctx) => {
    if (!canUseMail(ctx.caller)) return null;
    const account = await accountFor(ctx, ctx.caller.id);
    if (!account) return { connected: false as const, isAdmin: ctx.caller.isAdmin };
    return {
      connected: true as const,
      isAdmin: ctx.caller.isAdmin,
      email: account.email,
      unseen: account.unseen ?? null,
      checkedAt: account.checkedAt ?? null,
      error: account.error ?? null,
    };
  },
});

/** Everyone who could get a mailbox, and whether one is set. Never the password. */
export const adminList = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const [users, accounts] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
      ctx.db.query("mailAccounts").collect(),
    ]);
    const byUser = new Map(accounts.map((a) => [a.userId, a]));
    return users
      .map((u) => {
        const account = byUser.get(u._id);
        return {
          userId: u._id,
          name: displayName(u),
          loginEmail: u.email,
          mailEmail: account?.email ?? null,
          error: account?.error ?? null,
          checkedAt: account?.checkedAt ?? null,
          unseen: account?.unseen ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

export const apiRequireAdmin = serverUserQuery({
  role: "admin",
  args: {},
  handler: async () => true,
});

/** apps/api calls this after it has checked the login against IONOS and
 *  encrypted the password. */
export const apiSetAccount = serverUserMutation({
  role: "admin",
  args: { userId: v.id("users"), email: v.string(), passwordEnc: v.string() },
  handler: async (ctx, { userId, email, passwordEnc }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.status === "removed") {
      throw new ConvexError({ code: "not_found", message: "Person nicht gefunden." });
    }
    const now = Date.now();
    const existing = await accountFor(ctx, userId);
    const fields = {
      email: email.trim().toLowerCase(),
      passwordEnc,
      setBy: ctx.caller.id,
      updatedAt: now,
      // Start from a fresh baseline: the first poll records where the inbox
      // stands instead of announcing everything already in it as new.
      uidValidity: undefined,
      uidNext: undefined,
      unseen: undefined,
      checkedAt: undefined,
      error: undefined,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("mailAccounts", { userId, ...fields });
    await recordUnifiedAudit(ctx, {
      domain: "integrations",
      integration: "ionos-mail",
      actorUserId: ctx.caller.id,
      action: existing ? "mail_account_updated" : "mail_account_set",
      target: userId,
      detail: fields.email,
      at: now,
    });
  },
});

export const removeAccount = userMutation({
  role: "admin",
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const existing = await accountFor(ctx, userId);
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await recordUnifiedAudit(ctx, {
      domain: "integrations",
      integration: "ionos-mail",
      actorUserId: ctx.caller.id,
      action: "mail_account_removed",
      target: userId,
      detail: existing.email,
      at: Date.now(),
    });
  },
});

/** The caller's own mailbox only — admins included. Setting someone's
 *  password never lets anyone else read that inbox. */
export const apiMyAccount = serverUserQuery({
  args: {},
  handler: async (ctx) => {
    if (!canUseMail(ctx.caller)) return null;
    const account = await accountFor(ctx, ctx.caller.id);
    if (!account) return null;
    return { email: account.email, passwordEnc: account.passwordEnc };
  },
});

/** A live read found the stored password no longer works. */
export const apiMarkAuthFailed = serverUserMutation({
  args: {},
  handler: async (ctx) => {
    const account = await accountFor(ctx, ctx.caller.id);
    if (account && account.error !== "auth") await ctx.db.patch(account._id, { error: "auth" });
  },
});
