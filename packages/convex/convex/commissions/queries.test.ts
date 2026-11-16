/** Provisionen: Staffel, Boni und Zugriff (nur Admins). */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  healthyBonus,
  hitrateBonus,
  isoWeek,
  monthBonus,
  tierAmount,
  weekBonus,
  weeksOfMonth,
} from "./rules";

describe("rules", () => {
  test("Staffel: 1–24 frei, 25–30 je 10, 31–40 je 20, ab 41 je 25 (40 = 260 €)", () => {
    expect(tierAmount(0)).toBe(0);
    expect(tierAmount(24)).toBe(0);
    expect(tierAmount(25)).toBe(10);
    expect(tierAmount(30)).toBe(60);
    expect(tierAmount(31)).toBe(80);
    expect(tierAmount(40)).toBe(260);
    expect(tierAmount(41)).toBe(285);
    expect(tierAmount(50)).toBe(510);
  });

  test("Boni an den Grenzen", () => {
    expect(weekBonus(14)).toBe(0);
    expect(weekBonus(15)).toBe(50);
    expect(monthBonus(60)).toBe(0);
    expect(monthBonus(61)).toBe(50);
    expect(hitrateBonus(24.9)).toBe(0);
    expect(hitrateBonus(25)).toBe(50);
    expect(hitrateBonus(null)).toBe(0);
    expect([0, 1, 2, 3, 4, 9].map(healthyBonus)).toEqual([0, 0, 0, 100, 100, 100]);
  });

  test("Wochen zählen zum Monat ihres Donnerstags", () => {
    // Oktober 2026: Do 1.10. → KW 40 (28.9.–4.10.) gehört zum Oktober.
    const oct = weeksOfMonth("2026-10");
    expect(oct[0]).toEqual({ kw: 40, monday: "2026-09-28", sunday: "2026-10-04" });
    expect(oct.at(-1)).toEqual({ kw: 44, monday: "2026-10-26", sunday: "2026-11-01" });
    expect(weeksOfMonth("2026-09").at(-1)?.kw).toBe(39);
    expect(isoWeek("2027-01-01")).toBe(53);
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const since = Date.UTC(2026, 0, 1);
    const user = (clerkUserId: string, firstName: string, role: "admin" | "employee") =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName,
        lastName: "Test",
        role,
        status: "active",
        external: false,
        createdAt: since,
      });
    await user("admin", "Ada", "admin");
    const anna = await user("anna", "Anna", "employee");
    const ben = await user("ben", "Ben", "employee");
    const companyId = await ctx.db.insert("companies", {
      name: "Advantis",
      slug: "advantis",
      createdAt: now,
      updatedAt: now,
    });
    const employee = (name: string, userId: typeof anna) =>
      ctx.db.insert("performanceEmployees", { name, active: true, companyId, userId });
    const annaEmp = await employee("Anna Test", anna);
    const benEmp = await employee("Ben Test", ben);
    const report = (employeeId: typeof annaEmp, wonMonth: number, workableCreated: number) =>
      ctx.db.insert("performanceReports", {
        employeeId,
        companyId,
        reportDate: "2026-10-30",
        wonMonth,
        workableCreated,
        sourceFile: "test.xlsx",
        uploadedAt: now,
      });
    // Anna: 62 Abschlüsse, Hitrate 31 %; Ben: 20 Abschlüsse, Hitrate 10 %.
    await report(annaEmp, 62, 200);
    await report(benEmp, 20, 200);
    // Anna: 15 Closed Won in KW 41 (5.–11.10.), 14 in KW 42.
    for (let i = 0; i < 15; i++) {
      await ctx.db.insert("performanceWonOpps", {
        companyId,
        owner: "Anna Test",
        closeDate: "2026-10-07",
      });
    }
    for (let i = 0; i < 14; i++) {
      await ctx.db.insert("performanceWonOpps", {
        companyId,
        owner: "Anna Test",
        closeDate: "2026-10-14",
      });
    }
    // Ben war im September krank; Anna ist seit Januar gesund.
    await ctx.db.insert("timeAbsences", {
      userId: ben,
      type: "sick",
      startDate: "2026-09-29",
      endDate: "2026-10-01",
      halfDayStart: false,
      halfDayEnd: false,
      status: "approved",
      updatedAt: now,
    });
    return { companyId };
  });
  return { t, ids };
}

describe("commissions.queries.month", () => {
  test("Mitarbeiter sehen keine Provisionen", async () => {
    const { t } = await setup();
    await expect(
      t.withIdentity({ subject: "anna" }).query(api.commissions.queries.month, { ym: "2026-10" }),
    ).rejects.toThrow();
  });

  test("rechnet Staffel und Boni je Mitarbeiter", async () => {
    const { t, ids } = await setup();
    const res = await t
      .withIdentity({ subject: "admin" })
      .query(api.commissions.queries.month, { ym: "2026-10" });
    expect(res.companyId).toBe(ids.companyId);
    const [anna, ben] = res.rows;
    // Anna: Staffel 60 + 200 + 22×25 = 810, KW 41 +50, >60 +50, Hitrate 31 % +50,
    // Jan–Sep gesund (9 Vormonate) +100.
    expect(anna).toMatchObject({
      name: "Anna Test",
      won: 62,
      hitrate: 31,
      tierAmount: 810,
      weeksBonus: 50,
      monthBonus: 50,
      hitrateBonus: 50,
      healthyStreak: 9,
      healthyBonus: 100,
      total: 1060,
    });
    expect(anna.weeks.find((w) => w.kw === 41)).toEqual({ kw: 41, won: 15, bonus: 50 });
    expect(anna.weeks.find((w) => w.kw === 42)).toEqual({ kw: 42, won: 14, bonus: 0 });
    // Ben: im September krank → Vormonats-Serie 0, keine Boni.
    expect(ben).toMatchObject({ won: 20, total: 0, healthyStreak: 0 });
    expect(ben.sickDays).toEqual(["2026-10-01"]);
  });

  test("100 € jeden Monat, wenn die 3 Vormonate ohne Krankmeldung waren", async () => {
    const { t } = await setup();
    const admin = t.withIdentity({ subject: "admin" });
    const row = async (ym: string, name: string) =>
      (await admin.query(api.commissions.queries.month, { ym })).rows.find((r) => r.name === name);
    // Seit Januar dabei: im März erst 2 Vormonate, im April 3.
    expect(await row("2026-03", "Anna Test")).toMatchObject({ healthyStreak: 2, healthyBonus: 0 });
    expect(await row("2026-04", "Anna Test")).toMatchObject({
      healthyStreak: 3,
      healthyBonus: 100,
    });
    // Ben krank Sep/Okt: Januar zählt noch Oktober mit, ab Februar wieder 100 €.
    expect(await row("2027-01", "Ben Test")).toMatchObject({ healthyStreak: 2, healthyBonus: 0 });
    expect(await row("2027-02", "Ben Test")).toMatchObject({ healthyStreak: 3, healthyBonus: 100 });
  });
});
