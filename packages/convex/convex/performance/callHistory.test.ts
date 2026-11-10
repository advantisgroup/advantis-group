/**
 * Call history for someone who joined a calls dashboard later: copied from
 * their row on another dashboard (same account or same unlinked name), only
 * into gaps, and idempotent.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

describe("call history", () => {
  test("copies calls and interactions into gaps only, once", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const company = (name: string, kind: "sales" | "calls") =>
        ctx.db.insert("companies", { name, slug: name, kind, createdAt: now, updatedAt: now });
      const sales = await company("sales", "sales");
      const onboarding = await company("onboarding", "calls");
      const src = await ctx.db.insert("performanceEmployees", {
        name: "Dalia Dohlen",
        active: true,
        companyId: sales,
      });
      const target = await ctx.db.insert("performanceEmployees", {
        name: "Dalia Dohlen",
        active: true,
        companyId: onboarding,
      });
      const report = (
        employeeId: typeof src,
        companyId: typeof sales,
        date: string,
        calls: number,
      ) =>
        ctx.db.insert("performanceReports", {
          employeeId,
          companyId,
          reportDate: date,
          callsToday: calls,
          leadsCreated: 5,
          sourceFile: "g.csv",
          uploadedAt: now,
        });
      await report(src, sales, "2026-10-01", 40);
      await report(src, sales, "2026-10-02", 50);
      await report(target, onboarding, "2026-10-02", 55); // already there
      for (const date of ["2026-10-01", "2026-10-02"]) {
        await ctx.db.insert("performanceInteractions", {
          employeeId: src,
          companyId: sales,
          date,
          startedAt: now,
          durationSec: 60,
          sourceFile: "i.csv",
          uploadedAt: now,
        });
      }
      return { sales, onboarding, src, target };
    });

    const pairs = await t.query(internal.performance.callHistory.pairs, {
      companyId: ids.onboarding,
    });
    expect(pairs).toEqual([{ target: ids.target, sources: [ids.src] }]);

    const first = await t.mutation(internal.performance.callHistory.copyMonth, {
      target: ids.target,
      source: ids.src,
      ym: "2026-10",
    });
    expect(first).toEqual({ days: 1, interactions: 2 });
    const again = await t.mutation(internal.performance.callHistory.copyMonth, {
      target: ids.target,
      source: ids.src,
      ym: "2026-10",
    });
    expect(again).toEqual({ days: 0, interactions: 0 });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("performanceReports")
        .withIndex("by_employee_date", (q) => q.eq("employeeId", ids.target))
        .collect(),
    );
    expect(rows.map((r) => [r.reportDate, r.callsToday, r.leadsCreated])).toEqual([
      ["2026-10-01", 40, undefined],
      ["2026-10-02", 55, 5],
    ]);
  });
});
