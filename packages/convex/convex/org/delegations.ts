import { mutation, query } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { isOwnerOrAdmin, requireCapability, requireUser } from "../lib/auth";
import { recordUnifiedAudit } from "../lib/auditLogWrite";
import { displayName } from "../lib/users";

const scopeValidator = v.literal("absence_approvals");
const MAX_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

export async function hasActiveAbsenceApprovalDelegation(
  ctx: QueryCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  const rows = await ctx.db
    .query("approvalDelegations")
    .withIndex("by_delegate_and_endsAt", (q) => q.eq("delegateUserId", userId).gt("endsAt", now))
    .take(20);
  return rows.some(
    (row) => row.scope === "absence_approvals" && !row.revokedAt && row.startsAt <= now,
  );
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("approvalDelegations")
      .withIndex("by_delegate_and_endsAt", (q) =>
        q.eq("delegateUserId", user._id).gt("endsAt", now),
      )
      .take(20);
    return Promise.all(
      rows
        .filter((row) => !row.revokedAt && row.startsAt <= now)
        .map(async (row) => ({
          _id: row._id,
          scope: row.scope,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          delegatorName: displayName(await ctx.db.get(row.delegatorUserId)),
        })),
    );
  },
});

export const listGranted = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCapability(ctx, "manage_clockodo_team");
    const now = Date.now();
    const rows = await ctx.db
      .query("approvalDelegations")
      .withIndex("by_delegator_and_endsAt", (q) =>
        q.eq("delegatorUserId", user._id).gt("endsAt", now),
      )
      .take(50);
    return Promise.all(
      rows
        .filter((row) => !row.revokedAt)
        .map(async (row) => ({
          _id: row._id,
          delegateUserId: row.delegateUserId,
          delegateName: displayName(await ctx.db.get(row.delegateUserId)),
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        })),
    );
  },
});

export const create = mutation({
  args: {
    delegateUserId: v.id("users"),
    scope: scopeValidator,
    startsAt: v.number(),
    endsAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "manage_clockodo_team");
    const now = Date.now();
    if (args.delegateUserId === user._id) {
      throw new ConvexError({ code: "bad_request", message: "Choose a different person" });
    }
    if (
      args.startsAt >= args.endsAt ||
      args.endsAt <= now ||
      args.endsAt - args.startsAt > MAX_DURATION_MS
    ) {
      throw new ConvexError({ code: "bad_request", message: "Cover must last up to 90 days" });
    }
    const delegate = await ctx.db.get(args.delegateUserId);
    if (!delegate || delegate.status !== "active") {
      throw new ConvexError({ code: "bad_request", message: "Delegate must be active" });
    }
    const id = await ctx.db.insert("approvalDelegations", {
      ...args,
      delegatorUserId: user._id,
      createdAt: now,
    });
    await recordUnifiedAudit(ctx, {
      domain: "integrations",
      integration: "clockodo",
      actorUserId: user._id,
      action: "absence_approval_cover_granted",
      target: delegate.email,
      detail: `${args.startsAt}-${args.endsAt}`,
      at: now,
    });
    return { id };
  },
});

export const revoke = mutation({
  args: { delegationId: v.id("approvalDelegations") },
  handler: async (ctx, { delegationId }) => {
    const user = await requireCapability(ctx, "manage_clockodo_team");
    const delegation = await ctx.db.get(delegationId);
    if (!delegation) return { ok: true };
    if (!isOwnerOrAdmin(user, delegation.delegatorUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the granting manager or an admin can revoke this",
      });
    }
    const now = Date.now();
    await ctx.db.patch(delegationId, { revokedAt: now });
    const delegate = await ctx.db.get(delegation.delegateUserId);
    await recordUnifiedAudit(ctx, {
      domain: "integrations",
      integration: "clockodo",
      actorUserId: user._id,
      action: "absence_approval_cover_revoked",
      target: delegate?.email,
      at: now,
    });
    return { ok: true };
  },
});
