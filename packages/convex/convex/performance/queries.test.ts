/**
 * The team dashboard's numbers end to end: seeded report rows in, totals
 * out. Pure KPI math is covered in lib/kpi.test.ts.
 */
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
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

  test("a running month is compared with last month as of the same workday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T15:00:00Z"));
    try {
      const { ids, report, admin } = await setup();
      // September: 3 won by its 2nd workday (2 Sep), 40 by month end.
      await report(ids.anna, "2026-09-02", { wonMonth: 3, callsToday: 10 });
      await report(ids.anna, "2026-09-30", { wonMonth: 40, callsToday: 10 });
      // October, 2nd workday: 4 won.
      await report(ids.anna, "2026-10-02", { wonMonth: 4, callsToday: 12 });

      const data = await admin.query(api.performance.queries.teamDashboard, {
        companyId: ids.companyId,
      });
      expect(data.ym).toBe("2026-10");
      expect(data.comparison).toMatchObject({ mode: "sameWorkday", vmCutoff: "2026-09-02" });
      expect(data.dVm.wonMonth).toBe(1);
      expect(data.dVm.callsToday).toBe(2);
      expect(data.marks).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  test("a stale badge cache row is recomputed instead of trusted", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T08:00:00Z"));
    try {
      const { t, ids, report, admin } = await setup();
      await report(ids.anna, "2026-09-30", { wonMonth: 4, callsToday: 10 });
      await report(ids.ben, "2026-09-30", { wonMonth: 9, callsToday: 5 });
      await t.run(async (ctx) => {
        const storageId = await ctx.storage.store(new Blob(["x"]));
        // Cached with Anna winning, then Ben's late report came in.
        await ctx.db.insert("performanceBadgeCache", {
          companyId: ids.companyId,
          ym: "2026-09",
          badges: { won: { value: 4, winners: [ids.anna] } },
          computedAt: Date.now() - 60_000,
        });
        await ctx.db.insert("performanceUploadLog", {
          companyId: ids.companyId,
          filename: "late.xlsx",
          storageId,
          rowsImported: 1,
          uploadedAt: Date.now(),
          reportKind: "opp",
          reportDate: "2026-09-30",
        });
      });

      const data = await admin.query(api.performance.queries.teamDashboard, {
        companyId: ids.companyId,
        ym: "2026-09",
      });
      expect(data.badgeCounts[ids.ben]?.won).toBe(1);
      expect(data.badgeCounts[ids.anna]?.won).toBeUndefined();

      await t.mutation(internal.performance.queries.cacheCompletedMonthBadges, {});
      const row = await t.run((ctx) =>
        ctx.db
          .query("performanceBadgeCache")
          .withIndex("by_company_ym", (q) => q.eq("companyId", ids.companyId).eq("ym", "2026-09"))
          .unique(),
      );
      expect(row?.badges.won.winners).toEqual([ids.ben]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a hidden employee's own page is gone", async () => {
    const { ids, admin } = await setup();
    await expect(
      admin.query(api.performance.queries.employeeDetail, { employeeId: ids.hidden }),
    ).rejects.toThrow("nicht gefunden");
  });
});
