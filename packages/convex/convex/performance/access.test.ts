/**
 * Who sees what in Performance, now that access is the intranet sign-in:
 * admins everything, a linked team's lead the team view of that dashboard,
 * everyone else only their own employee page.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { nameKey } from "./dashboards";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (
      clerkUserId: string,
      role: "admin" | "employee",
      firstName: string,
      lastName: string,
    ) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName,
        lastName,
        role,
        status: "active",
        external: false,
        createdAt: now,
      });
    const admin = await user("admin", "admin", "Ada", "Admin");
    const lead = await user("lead", "employee", "Lea", "Leitung");
    const anna = await user("anna", "employee", "Anna", "Müller");
    const ben = await user("ben", "employee", "Ben", "Becker");
    const evLead = await user("evlead", "employee", "Eva", "Volt");

    const sales = await ctx.db.insert("teams", {
      name: "Sales",
      slug: "sales",
      reportsToUserId: lead,
      createdAt: now,
      createdBy: admin,
    });
    const ev = await ctx.db.insert("teams", {
      name: "EV-Pilot",
      slug: "ev-pilot",
      reportsToUserId: evLead,
      createdAt: now,
      createdBy: admin,
    });
    for (const userId of [lead, anna, ben])
      await ctx.db.insert("userTeams", { userId, teamId: sales });
    await ctx.db.insert("userTeams", { userId: evLead, teamId: ev });

    const salesDash = await ctx.db.insert("companies", {
      name: "Sales",
      slug: "sales",
      teamIds: [sales],
      createdAt: now,
      updatedAt: now,
    });
    const evDash = await ctx.db.insert("companies", {
      name: "EV-Pilot",
      slug: "ev-pilot",
      teamIds: [ev],
      createdAt: now,
      updatedAt: now,
    });
    const annaEmp = await ctx.db.insert("performanceEmployees", {
      name: "Anna Müller",
      active: true,
      companyId: salesDash,
      userId: anna,
    });
    const benEmp = await ctx.db.insert("performanceEmployees", {
      name: "Becker, Ben",
      active: true,
      companyId: salesDash,
    });
    return { admin, lead, anna, ben, salesDash, evDash, annaEmp, benEmp };
  });
  return {
    t,
    ids,
    as: (subject: string) => t.withIdentity({ subject }),
  };
}

describe("performance access", () => {
  test("admin sees every dashboard with the team view", async () => {
    const { as, ids } = await setup();
    const me = await as("admin").query(api.performance.access.me, {});
    expect(me.isAdmin).toBe(true);
    expect(me.dashboards.map((d) => d.name)).toEqual(["EV-Pilot", "Sales"]);
    expect(me.dashboards.every((d) => d.canViewTeam)).toBe(true);
    await as("admin").query(api.performance.queries.teamDashboard, { companyId: ids.evDash });
  });

  test("a team lead sees their own team's view, not another team's", async () => {
    const { as, ids } = await setup();
    const me = await as("lead").query(api.performance.access.me, {});
    expect(me.dashboards).toEqual([
      expect.objectContaining({ name: "Sales", canViewTeam: true, employeeId: null }),
    ]);
    await as("lead").query(api.performance.queries.teamDashboard, {});
    await as("lead").query(api.performance.queries.employeeDetail, { employeeId: ids.annaEmp });
    await expect(
      as("lead").query(api.performance.queries.teamDashboard, { companyId: ids.evDash }),
    ).rejects.toThrow("Kein Zugriff");
  });

  test("an employee sees only their own numbers", async () => {
    const { as, ids } = await setup();
    const me = await as("anna").query(api.performance.access.me, {});
    expect(me.dashboards).toEqual([
      expect.objectContaining({ name: "Sales", canViewTeam: false, employeeId: ids.annaEmp }),
    ]);
    await as("anna").query(api.performance.queries.employeeDetail, { employeeId: ids.annaEmp });
    await expect(
      as("anna").query(api.performance.queries.employeeDetail, { employeeId: ids.benEmp }),
    ).rejects.toThrow("Kein Zugriff");
    await expect(as("anna").query(api.performance.queries.teamDashboard, {})).rejects.toThrow(
      "Team-Ansicht",
    );
  });

  test("only an empty dashboard can be deleted, and only by an admin", async () => {
    const { as, ids, t } = await setup();
    const empty = await t.run((ctx) =>
      ctx.db.insert("companies", {
        name: "07",
        slug: "07",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await expect(
      as("lead").mutation(api.performance.dashboards.remove, { companyId: empty }),
    ).rejects.toThrow();
    await expect(
      as("admin").mutation(api.performance.dashboards.remove, { companyId: ids.salesDash }),
    ).rejects.toThrow("kann nicht gelöscht werden");
    await as("admin").mutation(api.performance.dashboards.remove, { companyId: empty });
    expect(await t.run((ctx) => ctx.db.get(empty))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(ids.salesDash))).not.toBeNull();
  });

  test("only admins manage dashboards and links", async () => {
    const { as, ids } = await setup();
    await expect(as("lead").query(api.performance.dashboards.list, {})).rejects.toThrow();
    await expect(
      as("lead").mutation(api.performance.dashboards.linkEmployee, {
        employeeId: ids.benEmp,
        userId: ids.lead,
      }),
    ).rejects.toThrow();
  });

  test("auto-link matches report names to people regardless of order and accents", async () => {
    const { as, ids, t } = await setup();
    const result = await as("admin").mutation(api.performance.dashboards.autoLink, {
      companyId: ids.salesDash,
    });
    expect(result).toEqual({ fromLogins: 0, byName: 1 });
    const ben = await t.run((ctx) => ctx.db.get(ids.benEmp as Id<"performanceEmployees">));
    expect(ben?.userId).toBe(ids.ben);

    // Ben now sees his own page.
    const me = await as("ben").query(api.performance.access.me, {});
    expect(me.dashboards[0].employeeId).toBe(ids.benEmp);
  });

  test("a person can't be linked to two names on one dashboard", async () => {
    const { as, ids } = await setup();
    await expect(
      as("admin").mutation(api.performance.dashboards.linkEmployee, {
        employeeId: ids.benEmp,
        userId: ids.anna,
      }),
    ).rejects.toThrow("schon einem anderen Namen");
  });
});

describe("rollout stage", () => {
  test("before PERFORMANCE_MODE=live only admins see dashboards", async () => {
    const { as } = await setup();
    const before = process.env.PERFORMANCE_MODE;
    delete process.env.PERFORMANCE_MODE;
    try {
      const lead = await as("lead").query(api.performance.access.me, {});
      expect(lead.live).toBe(false);
      expect(lead.dashboards).toEqual([]);
      await expect(as("anna").query(api.performance.queries.teamDashboard, {})).rejects.toThrow();
      const admin = await as("admin").query(api.performance.access.me, {});
      expect(admin.dashboards.length).toBe(2);
    } finally {
      process.env.PERFORMANCE_MODE = before;
    }
  });
});

describe("nameKey", () => {
  test("ignores order, case, accents and ß", () => {
    expect(nameKey("Eyßelein, Michael")).toBe(nameKey("michael eysselein"));
    expect(nameKey("Müller Anna")).toBe(nameKey("Anna Muller"));
  });
});

describe("transition stubs for an older intranet build", () => {
  test("old session calls answer 'no session' instead of failing", async () => {
    const { as, t } = await setup();
    expect(await as("anna").query(api.performance.auth.validateSession, { token: "" })).toEqual({
      valid: false,
    });
    expect(await as("anna").mutation(api.performance.auth.createSessionForLinkedAccount, {})).toBe(
      null,
    );
    expect(await t.query(api.performance.companies.getByDomain, { domain: "perf.07er.de" })).toBe(
      null,
    );
  });
});
