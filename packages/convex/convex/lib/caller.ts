import { ConvexError } from "convex/values";

import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { hasApplicantAccess, isApplicantAreaMember, isApplicantDelegate } from "../hr/lib/access";
import {
  type Capability,
  type Role,
  effectiveCustomRoleIds,
  effectiveRole,
  getCurrentUser,
  getUserByClerkId,
  liveCapabilities,
} from "./auth";

export type RoleRequirement = "manager" | "admin";

const forbidden = () =>
  new ConvexError({ code: "forbidden", message: "You do not have permission to do that" });

/**
 * The signed-in, active person behind a request, with everything they're
 * allowed to do worked out once. Every permission question goes through here
 * — roles, custom-role capabilities, per-person grants and sandbox mode — so
 * the rules live in one place instead of in each handler.
 */
export class Caller {
  constructor(
    readonly user: Doc<"users">,
    private readonly capabilities: ReadonlySet<Capability>,
  ) {}

  get id(): Id<"users"> {
    return this.user._id;
  }

  /** The role in effect, which is the sandbox role while an admin previews one. */
  get role(): Role {
    return effectiveRole(this.user);
  }

  get sandboxed(): boolean {
    return this.user.sandboxRole != null;
  }

  get isAdmin(): boolean {
    return this.role === "admin";
  }

  get isManager(): boolean {
    return this.role === "admin" || this.role === "manager";
  }

  /** Admin by their stored role, seeing through sandbox mode. Only for the
   *  sandbox controls themselves. */
  get isRealAdmin(): boolean {
    return this.user.role === "admin";
  }

  /** Managers and admins hold every capability; employees only what their
   *  custom roles grant, and nothing while sandboxed. */
  can(capability: Capability): boolean {
    return this.isManager || (!this.sandboxed && this.capabilities.has(capability));
  }

  /** The author/creator, or an admin. */
  owns(ownerId: Id<"users">): boolean {
    return ownerId === this.user._id || this.isAdmin;
  }

  /** Anyone can grant "employee"; only admins can hand out manager or admin. */
  canGrant(role: Role): boolean {
    return role === "employee" || this.isAdmin;
  }

  get hasGfAccess(): boolean {
    return !this.sandboxed && this.user.gfAccess === true;
  }

  /** On unless a manager turned it off. */
  get canRequestUploads(): boolean {
    return this.user.uploadRequestsEnabled !== false;
  }

  get hasApplicantAccess(): boolean {
    return hasApplicantAccess(this.user);
  }

  get isApplicantDelegate(): boolean {
    return isApplicantDelegate(this.user);
  }

  get isApplicantAreaMember(): boolean {
    return isApplicantAreaMember(this.user);
  }

  meets(requirement: RoleRequirement): boolean {
    return requirement === "admin" ? this.isAdmin : this.isManager;
  }

  require(requirement: RoleRequirement | Capability | boolean): this {
    const ok =
      typeof requirement === "boolean"
        ? requirement
        : requirement === "admin" || requirement === "manager"
          ? this.meets(requirement)
          : this.can(requirement);
    if (!ok) throw forbidden();
    return this;
  }

  /** Plain data for crossing from a query into an action. */
  toJSON(): CallerData {
    return { user: this.user, capabilities: [...this.capabilities] };
  }

  static fromJSON(data: CallerData): Caller {
    return new Caller(data.user, new Set(data.capabilities));
  }
}

export type CallerData = { user: Doc<"users">; capabilities: Capability[] };

/** Build a Caller for a user already in hand. Suspended and removed people
 *  get null — nothing downstream should ever act for them. */
export async function loadCaller(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users"> | null,
): Promise<Caller | null> {
  if (!user || user.status !== "active") return null;
  const roles = user.sandboxRole
    ? []
    : await Promise.all(effectiveCustomRoleIds(user).map((id) => ctx.db.get(id)));
  return new Caller(
    user,
    new Set(roles.flatMap((role) => (role ? liveCapabilities(role.capabilities) : []))),
  );
}

/** The browser session's caller, or null when signed out or not active. */
export async function getSessionCaller(ctx: QueryCtx | MutationCtx): Promise<Caller | null> {
  return loadCaller(ctx, await getCurrentUser(ctx));
}

export async function requireSessionCaller(ctx: QueryCtx | MutationCtx): Promise<Caller> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError({ code: "unauthenticated", message: "Not signed in" });
  const caller = await loadCaller(ctx, user);
  if (!caller) throw new ConvexError({ code: "forbidden", message: "Account suspended" });
  return caller;
}

/** The caller apps/api vouched for by Clerk id, or null when there's no
 *  active account behind it. */
export async function getServerCaller(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
): Promise<Caller | null> {
  return loadCaller(ctx, await getUserByClerkId(ctx, clerkUserId));
}

export async function requireServerCaller(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string,
): Promise<Caller> {
  const caller = await getServerCaller(ctx, clerkUserId);
  if (!caller) throw new ConvexError({ code: "not_found", message: "User not found" });
  return caller;
}
