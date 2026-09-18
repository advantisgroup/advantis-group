import { v } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { query } from "../functions";
import { type QueryCtx } from "../_generated/server";
import { requireAdmin } from "../lib/auth";

/**
 * Read-only: every area a profile is linked into and what that area has
 * granted. Each area keeps its own authorization model; granting still
 * happens in each area's own admin page.
 */

export type PerformanceAccessSubprofile =
  | { status: "not_linked" }
  | {
      status: "linked";
      loginId: Id<"performanceLogins">;
      email: string;
      companyName: string | null;
      roleName: string | null;
      isSuperAdmin: boolean;
      autoLinked: boolean;
    };

/** A user can be linked to at most one Performance login — `createLogin`
 * and `linkMyAccount` both refuse to link a second one — so "the" login is
 * a real singular, not just the first of many. */
export async function getPerformanceAccessSubprofile(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<PerformanceAccessSubprofile> {
  const login = await ctx.db
    .query("performanceLogins")
    .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", userId))
    .first();
  if (!login) return { status: "not_linked" };

  const [company, role] = await Promise.all([
    login.companyId ? ctx.db.get(login.companyId) : null,
    login.roleId ? ctx.db.get(login.roleId) : null,
  ]);
  return {
    status: "linked",
    loginId: login._id,
    email: login.email,
    companyName: company?.name ?? null,
    roleName: role?.name ?? null,
    isSuperAdmin: login.isSuperAdmin ?? false,
    autoLinked: login.autoLinkedVia === "email_match",
  };
}

export type ApplicantAccessSubprofile =
  | { status: "no_access" }
  | {
      status: "granted";
      isDelegate: boolean;
      vaultPasswordSet: boolean;
      hasPasskey: boolean;
    };

export async function getApplicantAccessSubprofile(
  ctx: QueryCtx,
  user: Pick<Doc<"users">, "_id" | "role" | "applicantAccess" | "applicantAccessDelegate">,
): Promise<ApplicantAccessSubprofile> {
  const granted = user.role === "admin" || user.applicantAccess === true;
  if (!granted) return { status: "no_access" };

  const [passwordRow, passkey] = await Promise.all([
    ctx.db
      .query("applicantVaultPasswords")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique(),
    ctx.db
      .query("passkeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first(),
  ]);
  return {
    status: "granted",
    isDelegate: user.applicantAccessDelegate === true,
    vaultPasswordSet: !!passwordRow,
    hasPasskey: !!passkey,
  };
}

export interface AcademyLink {
  academyId: string;
  linkedAt: number | undefined;
  autoLinked: boolean;
}

/** Unlike Performance, a person can legitimately show up linked to more
 * than one academy (or retake one under a new invite), so this stays a
 * list rather than forcing the same singular shape. */
export async function getAcademyLinks(ctx: QueryCtx, userId: Id<"users">): Promise<AcademyLink[]> {
  const rows = await ctx.db
    .query("academyParticipants")
    .withIndex("by_linkedUserId", (q) => q.eq("linkedUserId", userId))
    .collect();
  return rows.map((r) => ({
    academyId: r.academyId,
    linkedAt: r.linkedAt,
    autoLinked: r.autoLinkedVia === "email_match",
  }));
}

export const forUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const [performance, applicant, academies] = await Promise.all([
      getPerformanceAccessSubprofile(ctx, userId),
      getApplicantAccessSubprofile(ctx, user),
      getAcademyLinks(ctx, userId),
    ]);
    return { performance, applicant, academies };
  },
});
