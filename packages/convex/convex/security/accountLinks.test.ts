import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

function asUser(t: T, clerkUserId: string) {
  return t.withIdentity({ subject: clerkUserId });
}

async function seedAdmin(t: T, clerkUserId = "admin"): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      role: "admin",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedEmployee(
  t: T,
  opts: {
    clerkUserId: string;
    email: string;
    applicantAccess?: boolean;
    applicantAccessDelegate?: boolean;
  },
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId: opts.clerkUserId,
      email: opts.email,
      role: "employee",
      status: "active",
      external: false,
      applicantAccess: opts.applicantAccess,
      applicantAccessDelegate: opts.applicantAccessDelegate,
      createdAt: Date.now(),
    }),
  );
}

async function seedCompany(t: T): Promise<Id<"companies">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("companies", {
      name: "Sales Pirates",
      slug: "salespirates",
      domain: "salespirates.de",
      status: "active",
      adminBootstrapEmails: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function seedRole(
  t: T,
  companyId: Id<"companies">,
  name = "Team Lead",
): Promise<Id<"companyRoles">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("companyRoles", {
      companyId,
      name,
      permissions: [],
      isBuiltIn: true,
      createdAt: Date.now(),
    }),
  );
}

async function seedPerformanceLogin(
  t: T,
  opts: {
    email: string;
    companyId?: Id<"companies">;
    roleId?: Id<"companyRoles">;
    isSuperAdmin?: boolean;
    linkedUserId?: Id<"users">;
    autoLinkedVia?: "email_match";
  },
): Promise<Id<"performanceLogins">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("performanceLogins", {
      email: opts.email,
      name: "Login",
      passwordHash: "hash",
      companyId: opts.companyId,
      roleId: opts.roleId,
      isSuperAdmin: opts.isSuperAdmin,
      linkedUserId: opts.linkedUserId,
      autoLinkedVia: opts.autoLinkedVia,
      active: true,
      createdAt: Date.now(),
    }),
  );
}

async function seedAcademyParticipant(
  t: T,
  opts: {
    academyId: string;
    email: string;
    linkedUserId?: Id<"users">;
    autoLinkedVia?: "email_match";
  },
): Promise<Id<"academyParticipants">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("academyParticipants", {
      academyId: opts.academyId,
      name: "Participant",
      email: opts.email,
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: Date.now(),
      linkedUserId: opts.linkedUserId,
      linkedAt: opts.linkedUserId ? Date.now() : undefined,
      autoLinkedVia: opts.autoLinkedVia,
    }),
  );
}

describe("accountLinks.forUser", () => {
  test("rejects a non-admin caller", async () => {
    const t = setup();
    const employee = await seedEmployee(t, { clerkUserId: "emp", email: "emp@advantisgroup.de" });
    await expect(
      asUser(t, "emp").query(api.security.accountLinks.forUser, { userId: employee }),
    ).rejects.toThrow();
  });

  test("returns null for a user that doesn't exist", async () => {
    const t = setup();
    await seedAdmin(t);
    const other = await seedEmployee(t, {
      clerkUserId: "throwaway",
      email: "throwaway@advantisgroup.de",
    });
    await t.run(async (ctx) => ctx.db.delete(other));

    const result = await asUser(t, "admin").query(api.security.accountLinks.forUser, {
      userId: other,
    });
    expect(result).toBeNull();
  });

  test("reports not_linked/no_access/no academies for a plain unlinked user", async () => {
    const t = setup();
    await seedAdmin(t);
    const employee = await seedEmployee(t, {
      clerkUserId: "plain",
      email: "plain@advantisgroup.de",
    });

    const result = await asUser(t, "admin").query(api.security.accountLinks.forUser, {
      userId: employee,
    });
    expect(result).toEqual({
      performance: { status: "not_linked" },
      applicant: { status: "no_access" },
      academies: [],
    });
  });

  test("reports a linked, role-bearing Performance login with company/role names", async () => {
    const t = setup();
    await seedAdmin(t);
    const employee = await seedEmployee(t, {
      clerkUserId: "linked",
      email: "linked@advantisgroup.de",
    });
    const companyId = await seedCompany(t);
    const roleId = await seedRole(t, companyId, "Team Lead");
    await seedPerformanceLogin(t, {
      email: "linked@advantisgroup.de",
      companyId,
      roleId,
      linkedUserId: employee,
      autoLinkedVia: "email_match",
    });

    const result = await asUser(t, "admin").query(api.security.accountLinks.forUser, {
      userId: employee,
    });
    expect(result?.performance).toMatchObject({
      status: "linked",
      email: "linked@advantisgroup.de",
      companyName: "Sales Pirates",
      roleName: "Team Lead",
      isSuperAdmin: false,
      autoLinked: true,
    });
  });

  test("reports a super-admin Performance login without a company/role", async () => {
    const t = setup();
    await seedAdmin(t);
    const employee = await seedEmployee(t, {
      clerkUserId: "super",
      email: "super@advantisgroup.de",
    });
    await seedPerformanceLogin(t, {
      email: "super@advantisgroup.de",
      isSuperAdmin: true,
      linkedUserId: employee,
    });

    const result = await asUser(t, "admin").query(api.security.accountLinks.forUser, {
      userId: employee,
    });
    expect(result?.performance).toMatchObject({
      status: "linked",
      companyName: null,
      roleName: null,
      isSuperAdmin: true,
      autoLinked: false,
    });
  });

  test("reports applicant access granted via role admin, independent of applicantAccess flag", async () => {
    const t = setup();
    await seedAdmin(t);
    const admin = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "hr-admin",
        email: "hr-admin@advantisgroup.de",
        role: "admin",
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );

    const result = await asUser(t, "admin").query(api.security.accountLinks.forUser, {
      userId: admin,
    });
    expect(result?.applicant).toEqual({
      status: "granted",
      isDelegate: false,
      vaultPasswordSet: false,
      hasPasskey: false,
    });
  });

  test("reports applicant access granted via applicantAccess flag, with vault password and passkey set", async () => {
    const t = setup();
    await seedAdmin(t);
    const employee = await seedEmployee(t, {
      clerkUserId: "hr-delegate",
      email: "hr-delegate@advantisgroup.de",
      applicantAccess: true,
      applicantAccessDelegate: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("applicantVaultPasswords", {
        userId: employee,
        hash: "hash",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("passkeys", {
        userId: employee,
        credentialId: "cred-1",
        publicKey: "pub-1",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
        name: "Test key",
        createdAt: Date.now(),
      });
    });

    const result = await asUser(t, "admin").query(api.security.accountLinks.forUser, {
      userId: employee,
    });
    expect(result?.applicant).toEqual({
      status: "granted",
      isDelegate: true,
      vaultPasswordSet: true,
      hasPasskey: true,
    });
  });

  test("reports multiple academy links, distinguishing auto-linked from human-linked", async () => {
    const t = setup();
    await seedAdmin(t);
    const employee = await seedEmployee(t, {
      clerkUserId: "student",
      email: "student@advantisgroup.de",
    });
    await seedAcademyParticipant(t, {
      academyId: "sales-101",
      email: "student@advantisgroup.de",
      linkedUserId: employee,
      autoLinkedVia: "email_match",
    });
    await seedAcademyParticipant(t, {
      academyId: "sales-202",
      email: "student@advantisgroup.de",
      linkedUserId: employee,
    });

    const result = await asUser(t, "admin").query(api.security.accountLinks.forUser, {
      userId: employee,
    });
    expect(result?.academies).toHaveLength(2);
    expect(result?.academies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ academyId: "sales-101", autoLinked: true }),
        expect.objectContaining({ academyId: "sales-202", autoLinked: false }),
      ]),
    );
  });
});
