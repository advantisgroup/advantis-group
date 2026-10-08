/**
 * Employee/KPI checks: week maths over month-to-date counters, the frozen
 * KPI figures, agreements in Monitoring with their due colours, access
 * (team leads and admins only) and the business review.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { counterOverRange, dueTone, reasonsOverRange, weekStart } from "./lib/checkKpis";

describe("check KPI maths", () => {
  const rows = [
    { employeeId: "e" as never, reportDate: "2026-09-28", leadsCreated: 90 },
    { employeeId: "e" as never, reportDate: "2026-09-30", leadsCreated: 100 },
    { employeeId: "e" as never, reportDate: "2026-10-01", leadsCreated: 4 },
    { employeeId: "e" as never, reportDate: "2026-10-02", leadsCreated: 9 },
  ];

  test("calendar week starts on Monday", () => {
    expect(weekStart("2026-10-01")).toBe("2026-09-28"); // Thursday
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday
  });

  test("a week across a month boundary adds both months' increase", () => {
    // Sep 28–30: 100 − counter on Sep 27 (none → 0) = 100; Oct 1–2: 9.
    expect(counterOverRange(rows, "leadsCreated", "2026-09-28", "2026-10-02")).toBe(109);
    // Mid-month: Oct 2 minus Oct 1.
    expect(counterOverRange(rows, "leadsCreated", "2026-10-02", "2026-10-02")).toBe(5);
    expect(counterOverRange(rows, "workableCreated", "2026-10-01", "2026-10-02")).toBeNull();
  });

  test("reasons added during a range", () => {
    const r = [
      { employeeId: "e" as never, reportDate: "2026-10-05", unqualifiedReasons: "Preis: 2" },
      {
        employeeId: "e" as never,
        reportDate: "2026-10-07",
        unqualifiedReasons: "Preis: 5; Kein Bedarf: 1",
      },
    ];
    expect(reasonsOverRange(r, "2026-10-06", "2026-10-07")).toEqual([
      { reason: "Preis", count: 3 },
      { reason: "Kein Bedarf", count: 1 },
    ]);
  });

  test("due colours", () => {
    expect(dueTone("2026-10-07", "2026-10-08")).toBe("overdue");
    expect(dueTone("2026-10-10", "2026-10-08")).toBe("soon");
    expect(dueTone("2026-10-15", "2026-10-08")).toBe("week");
    expect(dueTone("2026-10-30", "2026-10-08")).toBe("later");
    expect(dueTone(undefined, "2026-10-08")).toBe("none");
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (clerkUserId: string, role: "admin" | "employee", first: string, last: string) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: first,
        lastName: last,
        role,
        status: "active",
        external: false,
        createdAt: now,
      });
    const admin = await user("admin", "admin", "Ada", "Admin");
    const lead = await user("lead", "employee", "Lea", "Leitung");
    const anna = await user("anna", "employee", "Anna", "Müller");
    const team = await ctx.db.insert("teams", {
      name: "Sales",
      slug: "sales",
      reportsToUserId: lead,
      createdAt: now,
      createdBy: admin,
    });
    for (const u of [lead, anna]) await ctx.db.insert("userTeams", { userId: u, teamId: team });
    const companyId = await ctx.db.insert("companies", {
      name: "Sales",
      slug: "sales",
      teamIds: [team],
      createdAt: now,
      updatedAt: now,
    });
    const annaEmp = await ctx.db.insert("performanceEmployees", {
      name: "Anna Müller",
      active: true,
      companyId,
      userId: anna,
    });
    const report = (reportDate: string, fields: Record<string, number | string>) =>
      ctx.db.insert("performanceReports", {
        employeeId: annaEmp,
        companyId,
        reportDate,
        sourceFile: "t.xlsx",
        uploadedAt: now,
        ...fields,
      });
    await report("2026-09-04", { leadsCreated: 20, workableCreated: 10, wonMonth: 2 });
    await report("2026-10-06", { leadsCreated: 10, workableCreated: 5, wonMonth: 1 });
    await report("2026-10-07", {
      leadsCreated: 16,
      workableCreated: 8,
      wonMonth: 3,
      unqualifiedReasons: "Preis: 2",
      callsToday: 30,
    });
    await ctx.db.insert("performanceWonOpps", {
      companyId,
      owner: "Anna Müller",
      closeDate: "2026-10-06",
    });
    return { companyId, annaEmp };
  });
  return {
    t,
    ids,
    as: (subject: string) => t.withIdentity({ subject }),
  };
}

describe("checks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a lead records an employee check; figures are frozen; Monitoring shows the agreement", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T09:00:00Z"));
    const { ids, as } = await setup();

    await expect(
      as("anna").query(api.performance.checks.liveKpis, { employeeId: ids.annaEmp }),
    ).rejects.toThrow("Team-Ansicht");

    const live = await as("lead").query(api.performance.checks.liveKpis, {
      employeeId: ids.annaEmp,
    });
    const row = (key: string) => live.kpis.rows.find((r) => r.key === key)!;
    expect(live.kpis.week.start).toBe("2026-10-05");
    expect(row("leads")).toMatchObject({ month: 16, vm: 20, week: 16 });
    expect(row("workableRate")).toMatchObject({ month: 50, week: 50 });
    expect(row("won")).toMatchObject({ month: 3, week: 1 });
    expect(row("callsPerDay")).toMatchObject({ month: 30, week: 30 });
    expect(row("unqualified")).toMatchObject({ month: 2, week: 2 });

    const { checkId } = await as("lead").mutation(api.performance.checks.save, {
      employeeId: ids.annaEmp,
      type: "employee",
      date: "2026-10-08",
      ratings: [
        { key: "leads", rating: "green" },
        { key: "won", rating: "red", note: "zu wenig" },
      ],
      tops: ["Gute Workable Rate", "", "Pünktlich"],
      goFors: ["Mehr Abschlüsse"],
      actions: [
        { text: "3 Abschlüsse pro Woche", dueDate: "2026-10-09", done: false },
        { text: "Leads > 30 Tage abarbeiten", dueDate: "2026-10-01", done: false },
      ],
    });

    const check = await as("lead").query(api.performance.checks.get, { checkId });
    expect(check.check.tops).toEqual(["Gute Workable Rate", "Pünktlich"]);
    expect(check.check.kpis.rows.find((r) => r.key === "leads")?.month).toBe(16);
    expect(check.actions).toHaveLength(2);

    const board = await as("lead").query(api.performance.checks.monitoring, {
      companyId: ids.companyId,
    });
    expect(board.employees[0]).toMatchObject({
      name: "Anna Müller",
      lastEmployeeCheck: "2026-10-08",
      nextDue: "2026-11-05",
      status: "ok",
      open: 2,
    });
    expect(board.open.map((o) => [o.text, o.tone])).toEqual([
      ["Leads > 30 Tage abarbeiten", "overdue"],
      ["3 Abschlüsse pro Woche", "soon"],
    ]);

    await as("lead").mutation(api.performance.checks.setActionDone, {
      actionId: board.open[0].id as never,
      done: true,
    });
    const after = await as("lead").query(api.performance.checks.monitoring, {
      companyId: ids.companyId,
    });
    expect(after.open).toHaveLength(1);
    expect(after.done[0]).toMatchObject({
      text: "Leads > 30 Tage abarbeiten",
      doneByName: "Lea Leitung",
    });

    await expect(
      as("anna").mutation(api.performance.checks.save, {
        employeeId: ids.annaEmp,
        type: "kpi",
        date: "2026-10-08",
        ratings: [],
        tops: [],
        goFors: [],
        actions: [],
      }),
    ).rejects.toThrow();
  });

  test("business review: month table with VM and the review's own measures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T09:00:00Z"));
    const { ids, as } = await setup();
    const br = await as("admin").query(api.performance.reviews.get, { companyId: ids.companyId });
    expect(br.ym).toBe("2026-10");
    expect(br.rows[0]).toMatchObject({ name: "Anna Müller" });
    expect(br.rows[0].cur.leadsCreated).toBe(16);
    expect(br.rows[0].vm.leadsCreated).toBe(20);

    await as("admin").mutation(api.performance.reviews.save, {
      companyId: ids.companyId,
      ym: "2026-10",
      notes: "Gutes Gespräch",
      actions: [
        { text: "Team-Schulung Einwände", dueDate: "2026-11-20", done: false },
        { employeeId: ids.annaEmp, text: "Coaching Abschluss", done: false },
      ],
    });
    const saved = await as("admin").query(api.performance.reviews.get, {
      companyId: ids.companyId,
      ym: "2026-10",
    });
    expect(saved.review.notes).toBe("Gutes Gespräch");
    expect(saved.review.actions.map((a) => a.text).sort()).toEqual([
      "Coaching Abschluss",
      "Team-Schulung Einwände",
    ]);
    const board = await as("admin").query(api.performance.checks.monitoring, {
      companyId: ids.companyId,
    });
    expect(board.open.map((o) => o.text)).toContain("Team-Schulung Einwände");
  });
});
