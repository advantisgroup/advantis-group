import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { type Capability } from "./auth";
import { Caller, getServerCaller, loadCaller } from "./caller";

type Overrides = Partial<Doc<"users">>;

function user(overrides: Overrides = {}): Doc<"users"> {
  return {
    _id: "u1" as Id<"users">,
    _creationTime: 0,
    clerkUserId: "clerk_1",
    email: "a@advantisgroup.de",
    role: "employee",
    status: "active",
    createdAt: 0,
    ...overrides,
  };
}

function caller(overrides: Overrides = {}, capabilities: Capability[] = []) {
  return new Caller(user(overrides), new Set(capabilities));
}

describe("roles", () => {
  test.each([
    ["admin", true, true],
    ["manager", false, true],
    ["employee", false, false],
  ] as const)("%s → isAdmin %s, isManager %s", (role, isAdmin, isManager) => {
    const c = caller({ role });
    expect(c.isAdmin).toBe(isAdmin);
    expect(c.isManager).toBe(isManager);
    expect(c.meets("admin")).toBe(isAdmin);
    expect(c.meets("manager")).toBe(isManager);
  });

  test("sandbox mode swaps the role but not isRealAdmin", () => {
    const c = caller({ role: "admin", sandboxRole: "employee" });
    expect(c.role).toBe("employee");
    expect(c.isAdmin).toBe(false);
    expect(c.isRealAdmin).toBe(true);
    expect(c.sandboxed).toBe(true);
  });
});

describe("capabilities", () => {
  test("managers and admins hold every capability", () => {
    expect(caller({ role: "manager" }).can("manage_members")).toBe(true);
    expect(caller({ role: "admin" }).can("use_ai")).toBe(true);
  });

  test("employees only hold what their custom roles grant", () => {
    const c = caller({}, ["use_ai"]);
    expect(c.can("use_ai")).toBe(true);
    expect(c.can("manage_members")).toBe(false);
  });

  test("custom-role capabilities don't count while sandboxed", () => {
    const c = caller({ role: "admin", sandboxRole: "employee" }, ["use_ai"]);
    expect(c.can("use_ai")).toBe(false);
  });

  test("a sandboxed manager view still passes on its tier", () => {
    expect(caller({ role: "admin", sandboxRole: "manager" }).can("manage_members")).toBe(true);
  });
});

describe("require", () => {
  test("passes quietly and returns the caller", () => {
    const c = caller({ role: "manager" });
    expect(c.require("manager")).toBe(c);
    expect(c.require("manage_blog")).toBe(c);
    expect(c.require(true)).toBe(c);
  });

  test.each([["admin"], ["manage_members"], [false]] as const)(
    "throws forbidden for an employee on %s",
    (requirement) => {
      expect(() => caller().require(requirement)).toThrow("You do not have permission to do that");
    },
  );
});

describe("ownership and granting", () => {
  test("owns: the author or an admin", () => {
    const other = "u2" as Id<"users">;
    expect(caller().owns("u1" as Id<"users">)).toBe(true);
    expect(caller().owns(other)).toBe(false);
    expect(caller({ role: "admin" }).owns(other)).toBe(true);
    expect(caller({ role: "manager" }).owns(other)).toBe(false);
  });

  test("canGrant: anyone grants employee, only admins more", () => {
    expect(caller().canGrant("employee")).toBe(true);
    expect(caller({ role: "manager" }).canGrant("manager")).toBe(false);
    expect(caller({ role: "admin" }).canGrant("admin")).toBe(true);
  });
});

describe("per-person grants", () => {
  test("applicant access: admins, or granted directly, never while sandboxed", () => {
    expect(caller({ role: "admin" }).hasApplicantAccess).toBe(true);
    expect(caller({ role: "manager" }).hasApplicantAccess).toBe(false);
    expect(caller({ applicantAccess: true }).hasApplicantAccess).toBe(true);
    expect(caller({ role: "admin", sandboxRole: "manager" }).hasApplicantAccess).toBe(false);
  });

  test("applicant delegate and area membership", () => {
    expect(caller({ applicantAccessDelegate: true }).isApplicantDelegate).toBe(true);
    expect(caller({ applicantAccessDelegate: true }).isApplicantAreaMember).toBe(true);
    expect(caller().isApplicantAreaMember).toBe(false);
    expect(
      caller({ applicantAccessDelegate: true, sandboxRole: "employee" }).isApplicantDelegate,
    ).toBe(false);
  });

  test("gf access is off in sandbox; uploads default on", () => {
    expect(caller({ gfAccess: true }).hasGfAccess).toBe(true);
    expect(caller({ gfAccess: true, role: "admin", sandboxRole: "employee" }).hasGfAccess).toBe(
      false,
    );
    expect(caller().canRequestUploads).toBe(true);
    expect(caller({ uploadRequestsEnabled: false }).canRequestUploads).toBe(false);
  });
});

test("toJSON and fromJSON round-trip", () => {
  const c = caller({ role: "manager" }, ["use_ai"]);
  const copy = Caller.fromJSON(c.toJSON());
  expect(copy.user).toEqual(c.user);
  expect(copy.can("use_ai")).toBe(true);
});

describe("loading", () => {
  async function seed(overrides: Omit<Overrides, "_id" | "_creationTime"> = {}) {
    const t = convexTest(schema, modules);
    const roleId = await t.run(async (ctx) => {
      const createdBy = await ctx.db.insert("users", {
        clerkUserId: "admin",
        email: "admin@advantisgroup.de",
        role: "admin",
        status: "active",
        createdAt: 0,
      });
      return ctx.db.insert("customRoles", {
        name: "AI",
        capabilities: ["use_ai"],
        createdBy,
        createdAt: 0,
      });
    });
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "clerk_1",
        email: "a@advantisgroup.de",
        role: "employee",
        status: "active",
        createdAt: 0,
        customRoleIds: [roleId],
        ...overrides,
      }),
    );
    return { t, userId };
  }

  test("an active user gets their custom-role capabilities", async () => {
    const { t } = await seed();
    const canUseAi = await t.run(async (ctx) =>
      (await getServerCaller(ctx, "clerk_1"))?.can("use_ai"),
    );
    expect(canUseAi).toBe(true);
  });

  test("a retired capability still stored on a role grants nothing", async () => {
    const { t, userId } = await seed();
    const capabilities = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      await ctx.db.patch(user!.customRoleIds![0]!, {
        capabilities: ["view_activity_admin", "use_ai"],
      });
      return (await loadCaller(ctx, user))?.toJSON().capabilities;
    });
    expect(capabilities).toEqual(["use_ai"]);
  });

  test.each([["suspended"], ["removed"]] as const)("a %s user gets no caller", async (status) => {
    const { t, userId } = await seed({ status });
    expect(await t.run(async (ctx) => loadCaller(ctx, await ctx.db.get(userId)))).toBeNull();
  });

  test("an unknown clerk id gets no caller", async () => {
    const { t } = await seed();
    expect(await t.run((ctx) => getServerCaller(ctx, "nobody"))).toBeNull();
  });
});
