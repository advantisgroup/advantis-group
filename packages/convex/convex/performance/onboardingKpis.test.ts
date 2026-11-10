/**
 * Onboarding KPIs from the cockpit log: counting per person and period,
 * the link through the intranet account, roster and team lead from the
 * cockpit settings, VM to the same workday.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { berlinInstant } from "../time/lib/berlin";
import { cockpitCounts, onboardingValues } from "./lib/onboardingKpis";

describe("cockpit counts", () => {
  const ev = (day: string, kind: string, extra: Record<string, string> = {}) => ({
    caseId: extra.caseId ?? "c1",
    kind,
    byUserId: extra.by ?? "u1",
    day,
    fromValue: extra.from,
    toValue: extra.to,
  });

  test("attempts, reachability, milestones and closed cases", () => {
    const counts = cockpitCounts(
      [
        ev("2026-11-02", "reached"),
        ev("2026-11-02", "not_reached", { caseId: "c2" }),
        ev("2026-11-03", "not_reached", { caseId: "c2" }),
        ev("2026-11-03", "email", { caseId: "c3" }),
        ev("2026-11-03", "note"),
        ev("2026-11-04", "milestone", { from: "cards", to: "1" }),
        ev("2026-11-04", "milestone", { from: "fuel", to: "1" }),
        ev("2026-11-05", "milestone", { from: "fuel", to: "0" }),
        ev("2026-11-05", "status", { from: "In Kontakt", to: "Winback" }),
        ev("2026-11-05", "status", { from: "Getankt", to: "Abgeschlossen" }),
        ev("2026-10-30", "reached"),
        ev("2026-11-02", "reached", { by: "u2" }),
      ],
      "2026-11-01",
      "2026-11-30",
    );
    expect(counts.get("u1")).toMatchObject({
      attempts: 4,
      reached: 1,
      notReached: 2,
      emails: 1,
      casesWorked: 3,
      cards: 1,
      fuel: 0,
      winback: 1,
      done: 1,
    });
    const values = onboardingValues(counts.get("u1"), true, {
      employeeId: "e",
      name: "x",
      callsToday: 40,
      callDays: 4,
      talkTotalSec: 2000,
    } as never);
    expect(values.reachRate).toBe(33.3);
    expect(values.callsPerDay).toBe(10);
    expect(values.talkAvgSec).toBe(50);
    // No cockpit data at all for a period: dashes, not zeros.
    expect(onboardingValues(undefined, false, undefined).reached).toBeNull();
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
    await user("admin", "admin", "Ada", "Admin");
    const lead = await user("lead", "employee", "Chris", "Leitung");
    const dalia = await user("dalia", "employee", "Dalia", "Dohlen");
    const melina = await user("melina", "employee", "Melina", "Bagis");
    await ctx.db.insert("onboardingSettings", {
      memberUserIds: [dalia, melina],
      leadUserIds: [lead],
      updatedAt: now,
      updatedByName: "Ada Admin",
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Onboarding",
      slug: "onboarding",
      kind: "calls",
      createdAt: now,
      updatedAt: now,
    });
    const caseId = await ctx.db.insert("onboardingCases", {
      customerKey: "1",
      customerNumber: "1",
      name: "Kunde",
      status: "step1",
      prio: false,
      inReport: true,
      createdAt: now,
      updatedAt: now,
    } as never);
    const log = async (
      day: string,
      kind: string,
      by: typeof dalia,
      extra: { fromValue?: string; toValue?: string } = {},
    ) =>
      ctx.db.insert("onboardingContacts", {
        caseId,
        kind,
        ...extra,
        at: berlinInstant(day, 10 * 60),
        byUserId: by,
        byName: "x",
      });
    // November to the 4th (workday 3) …
    await log("2026-11-02", "reached", dalia);
    await log("2026-11-03", "not_reached", dalia);
    await log("2026-11-04", "milestone", dalia, { fromValue: "cards", toValue: "1" });
    await log("2026-11-04", "reached", melina);
    // … October: up to workday 3 (05.10.) one attempt, later ones don't count for VM.
    await log("2026-10-02", "reached", dalia);
    await log("2026-10-20", "reached", dalia);
    return { companyId, dalia };
  });
  return { t, ids, as: (subject: string) => t.withIdentity({ subject }) };
}

describe("onboarding tab", () => {
  afterEach(() => vi.useRealTimers());

  test("cockpit team and lead join the linked dashboard; figures per person with VM", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T15:00:00Z"));
    const { ids, as } = await setup();

    await as("admin").mutation(api.performance.dashboards.update, {
      companyId: ids.companyId,
      name: "Onboarding",
      teamIds: [],
      departmentIds: [],
      onboardingCockpit: true,
    });

    // The cockpit lead sees the team view.
    const me = await as("lead").query(api.performance.access.me, {});
    expect(me.dashboards).toEqual([
      expect.objectContaining({ name: "Onboarding", canViewTeam: true, cockpit: true }),
    ]);

    const data = await as("lead").query(api.performance.onboardingKpis.team, {
      companyId: ids.companyId,
      ym: "2026-11",
    });
    expect(data.rows.map((r) => [r.name, r.linked])).toEqual([
      ["Dalia Dohlen", true],
      ["Melina Bagis", true],
    ]);
    const dalia = data.rows[0];
    expect(dalia.cur).toMatchObject({ attempts: 2, reached: 1, notReached: 1, cards: 1 });
    expect(dalia.cur.reachRate).toBe(50);
    expect(dalia.vm.attempts).toBe(1);
    expect(data.total.cur.reached).toBe(2);
    expect(data.trend.at(-1)?.ym).toBe("2026-11");

    // Dalia sees her own figures, not the team.
    await expect(
      as("dalia").query(api.performance.onboardingKpis.team, { companyId: ids.companyId }),
    ).rejects.toThrow();
    const own = await as("dalia").query(api.performance.onboardingKpis.employee, {
      employeeId: dalia.employeeId,
      ym: "2026-11",
    });
    expect(own.cur.attempts).toBe(2);
  });
});
