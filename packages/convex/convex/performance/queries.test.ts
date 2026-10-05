/**
 * The team dashboard's numbers end to end: seeded report rows in, totals
 * out. Pure KPI math is covered in lib/kpi.test.ts.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const admin = await ctx.db.insert("users", {
      clerkUserId: "admin",
      email: "admin@advantisgroup.de",
      firstName: "Ada",
      lastName: "Admin",
      role: "admin",
      status: "active",
      external: false,
      createdAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Sales",
      slug: "sales",
      createdAt: now,
      updatedAt: now,
    });
    const employee = (name: string, active = true) =>
      ctx.db.insert("performanceEmployees", { name, active, companyId });
    const anna = await employee("Anna Müller");
    const ben = await employee("Ben Becker");
    const hidden = await employee("Test Konto", false);
    return { admin, companyId, anna, ben, hidden };
  });

  const report = (
    employeeId: Id<"performanceEmployees">,
    reportDate: string,
    fields: Record<string, number | string>,
  ) =>
    t.run((ctx) =>
      ctx.db.insert("performanceReports", {
        employeeId,
        companyId: ids.companyId,
        reportDate,
        sourceFile: "test.xlsx",
        uploadedAt: Date.now(),
        ...fields,
      }),
    );

  return { t, ids, report, admin: t.withIdentity({ subject: "admin" }) };
}

describe("teamDashboard", () => {
  test("hidden employees are left out of totals, tables and badges", async () => {
    const { ids, report, admin } = await setup();
    await report(ids.anna, "2026-08-31", { wonMonth: 4, workableCreated: 10, callsToday: 20 });
    await report(ids.ben, "2026-08-31", { wonMonth: 2, workableCreated: 10, callsToday: 30 });
    await report(ids.hidden, "2026-08-31", { wonMonth: 50, workableCreated: 50, callsToday: 99 });

    const data = await admin.query(api.performance.queries.teamDashboard, {
      companyId: ids.companyId,
      ym: "2026-08",
    });
    expect(data.snaps.map((s) => s.name)).toEqual(["Anna Müller", "Ben Becker"]);
    expect(data.total.wonMonth).toBe(6);
    expect(data.total.callsToday).toBe(50);
    expect(data.total.hitrate).toBe(30);
    expect(Object.keys(data.badgeCounts)).not.toContain(ids.hidden);
  });

  test("a hidden employee's own page is gone", async () => {
    const { ids, admin } = await setup();
    await expect(
      admin.query(api.performance.queries.employeeDetail, { employeeId: ids.hidden }),
    ).rejects.toThrow("nicht gefunden");
  });
});
