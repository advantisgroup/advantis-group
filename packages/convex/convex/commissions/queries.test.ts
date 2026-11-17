/** Provisionen: Staffel, Boni und Zugriff (nur Admins). */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  healthyDue,
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
    expect([0, 2, 3, 9].map(healthyDue)).toEqual([false, false, true, true]);
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
    // Anna: Staffel 60 + 200 + 22×25 = 810, KW 41 +50, >60 +50, Hitrate 31 % +50.
    // Jan–Sep gesund → Gesund-Bonus fällig, aber erst per Häkchen ausgezahlt.
    expect(anna).toMatchObject({
      name: "Anna Test",
      won: 62,
      hitrate: 31,
      tierAmount: 810,
      weeksBonus: 50,
      monthBonus: 50,
      hitrateBonus: 50,
      healthyStreak: 9,
      healthyDue: true,
      healthyPaid: false,
      healthyBonus: 0,
      total: 960,
    });
    expect(anna.weeks.find((w) => w.kw === 41)).toEqual({ kw: 41, won: 15, bonus: 50 });
    expect(anna.weeks.find((w) => w.kw === 42)).toEqual({ kw: 42, won: 14, bonus: 0 });
    // Ben: im September krank → Vormonats-Serie 0, keine Boni.
    expect(ben).toMatchObject({ won: 20, total: 0, healthyStreak: 0 });
    expect(ben.sickDays).toEqual(["2026-10-01"]);
  });

  test("Gesund-Bonus: fällig nach 3 Monaten, Auszahlung per Häkchen startet neu", async () => {
    const { t, ids } = await setup();
    const admin = t.withIdentity({ subject: "admin" });
    const row = async (ym: string, name: string) =>
      (await admin.query(api.commissions.queries.month, { ym })).rows.find((r) => r.name === name)!;
    // Seit Januar dabei: im März erst 2 Vormonate, im April 3.
    expect(await row("2026-03", "Anna Test")).toMatchObject({
      healthyStreak: 2,
      healthyDue: false,
    });
    const april = await row("2026-04", "Anna Test");
    expect(april).toMatchObject({ healthyStreak: 3, healthyDue: true, healthyBonus: 0 });

    await admin.mutation(api.commissions.adjustments.set, {
      companyId: ids.companyId,
      ym: "2026-04",
      employeeId: april.employeeId,
      healthyPaid: true,
    });
    expect(await row("2026-04", "Anna Test")).toMatchObject({
      healthyPaid: true,
      healthyBonus: 100,
    });
    // Danach zählt es ab April neu: Juni erst 2 Monate, Juli wieder fällig.
    expect(await row("2026-06", "Anna Test")).toMatchObject({
      healthyStreak: 2,
      healthyDue: false,
    });
    expect(await row("2026-07", "Anna Test")).toMatchObject({ healthyStreak: 3, healthyDue: true });

    // Ben krank Sep/Okt: Januar zählt noch Oktober mit, Februar wieder fällig.
    expect(await row("2027-01", "Ben Test")).toMatchObject({ healthyDue: false });
    expect(await row("2027-02", "Ben Test")).toMatchObject({ healthyStreak: 3, healthyDue: true });
  });

  test("Closed Won und Hitrate lassen sich überschreiben und zurücksetzen", async () => {
    const { t, ids } = await setup();
    const admin = t.withIdentity({ subject: "admin" });
    const ben = async () =>
      (await admin.query(api.commissions.queries.month, { ym: "2026-10" })).rows.find(
        (r) => r.name === "Ben Test",
      )!;
    const { employeeId } = await ben();
    await admin.mutation(api.commissions.adjustments.set, {
      companyId: ids.companyId,
      ym: "2026-10",
      employeeId,
      wonOverride: 40,
      hitrateOverride: 25,
      note: " Nachgebucht laut Salesforce ",
    });
    expect(await ben()).toMatchObject({
      won: 40,
      autoWon: 20,
      wonOverridden: true,
      hitrate: 25,
      autoHitrate: 10,
      hitrateOverridden: true,
      tierAmount: 260,
      hitrateBonus: 50,
      note: "Nachgebucht laut Salesforce",
      total: 310,
    });

    await admin.mutation(api.commissions.adjustments.set, {
      companyId: ids.companyId,
      ym: "2026-10",
      employeeId,
      wonOverride: null,
      hitrateOverride: null,
      note: null,
    });
    expect(await ben()).toMatchObject({ won: 20, wonOverridden: false, total: 0, note: null });
    expect(await t.run((ctx) => ctx.db.query("commissionAdjustments").collect())).toHaveLength(0);

    await expect(
      t.withIdentity({ subject: "anna" }).mutation(api.commissions.adjustments.set, {
        companyId: ids.companyId,
        ym: "2026-10",
        employeeId,
        wonOverride: 99,
      }),
    ).rejects.toThrow();
  });

  test("Sonderbeträge kommen in die Summe und lassen sich entfernen", async () => {
    const { t, ids } = await setup();
    const admin = t.withIdentity({ subject: "admin" });
    const ben = async () =>
      (await admin.query(api.commissions.queries.month, { ym: "2026-10" })).rows.find(
        (r) => r.name === "Ben Test",
      )!;
    const { employeeId } = await ben();
    const key = { companyId: ids.companyId, ym: "2026-10", employeeId };
    await admin.mutation(api.commissions.adjustments.addExtra, {
      ...key,
      amount: 500,
      label: " Besondere Vereinbarung August-Woche ",
    });
    await admin.mutation(api.commissions.adjustments.addExtra, {
      ...key,
      amount: -20.5,
      label: "Abzug",
    });
    const row = await ben();
    expect(row).toMatchObject({ extrasTotal: 479.5, total: 479.5 });
    expect(row.extras.map((e) => e.label)).toEqual([
      "Besondere Vereinbarung August-Woche",
      "Abzug",
    ]);

    // Anderes Anpassen lässt die Beträge stehen.
    await admin.mutation(api.commissions.adjustments.set, { ...key, wonOverride: 40 });
    expect(await ben()).toMatchObject({ extrasTotal: 479.5, total: 739.5 });
    await admin.mutation(api.commissions.adjustments.set, { ...key, wonOverride: null });

    for (const e of row.extras) {
      await admin.mutation(api.commissions.adjustments.removeExtra, { ...key, id: e.id });
    }
    expect(await ben()).toMatchObject({ extras: [], total: 0 });
    expect(await t.run((ctx) => ctx.db.query("commissionAdjustments").collect())).toHaveLength(0);

    await expect(
      admin.mutation(api.commissions.adjustments.addExtra, { ...key, amount: 0, label: "x" }),
    ).rejects.toThrow();
    await expect(
      admin.mutation(api.commissions.adjustments.addExtra, { ...key, amount: 10, label: "  " }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity({ subject: "anna" }).mutation(api.commissions.adjustments.addExtra, {
        ...key,
        amount: 10,
        label: "x",
      }),
    ).rejects.toThrow();
  });

  test("Abteilung Sales steht oben, alle anderen darunter", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      const ben = (await ctx.db.query("users").collect()).find((u) => u.firstName === "Ben")!;
      const admin = (await ctx.db.query("users").collect()).find((u) => u.firstName === "Ada")!;
      const departmentId = await ctx.db.insert("departments", {
        name: "Sales",
        createdAt: Date.now(),
        createdBy: admin._id,
      });
      await ctx.db.patch(ben._id, { departmentId });
    });
    const res = await t
      .withIdentity({ subject: "admin" })
      .query(api.commissions.queries.month, { ym: "2026-10" });
    // Ben (Sales, 0 €) vor Anna (keine Abteilung, 960 €).
    expect(res.rows.map((r) => [r.name, r.sales])).toEqual([
      ["Ben Test", true],
      ["Anna Test", false],
    ]);
  });
});
