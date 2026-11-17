/** The 11/2026 one-off that drops teams in favour of departments. */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (local: string, first: string, domain = "advantisgroup.de") =>
      ctx.db.insert("users", {
        clerkUserId: local,
        email: `${local}@${domain}`,
        firstName: first,
        lastName: "Test",
        role: "employee",
        status: "active",
        external: false,
        createdAt: now,
      });
    const vahan = await user("hovhannisyan", "Vahan");
    const philipp = await user("suft", "Philipp");
    const anna = await user("efthymiou", "Alexandra");
    const andrea = await user("reichl", "Andrea", "salespirates.de");
    const team = await ctx.db.insert("teams", {
      name: "Sales",
      slug: "customer-care",
      createdAt: now,
      createdBy: vahan,
    });
    await ctx.db.insert("userTeams", { userId: anna, teamId: team });
    await ctx.db.patch(anna, { teams: ["customer-care"] });
    const onboardingDash = await ctx.db.insert("companies", {
      name: "Onboarding",
      slug: "onboarding",
      kind: "calls",
      teamIds: [team],
      createdAt: now,
      updatedAt: now,
    });
    return { vahan, philipp, anna, andrea, team, onboardingDash };
  });
  return { t, ids };
}

describe("drop teams", () => {
  test("dry run changes nothing", async () => {
    const { t, ids } = await setup();
    const res = await t.mutation(internal.org.dropTeams.run, { dryRun: true });
    expect(res.newDepartments).toEqual(["Sales", "Onboarding"]);
    expect(res.moves).toHaveLength(2);
    expect(res.unchanged).toHaveLength(2);
    const team = await t.run((ctx) => ctx.db.get(ids.team));
    expect(team?.archivedAt).toBeUndefined();
  });

  test("assigns departments, relinks dashboards and archives teams", async () => {
    const { t, ids } = await setup();
    await t.mutation(internal.org.dropTeams.run, { dryRun: false });
    await t.run(async (ctx) => {
      const deps = await ctx.db.query("departments").collect();
      const dep = (name: string) => deps.find((d) => d.name === name)!._id;
      expect((await ctx.db.get(ids.philipp))?.departmentId).toBe(dep("Onboarding"));
      const anna = await ctx.db.get(ids.anna);
      expect(anna?.departmentId).toBe(dep("Sales"));
      expect(anna?.teams).toBeUndefined();
      expect((await ctx.db.get(ids.vahan))?.departmentId).toBeUndefined();
      expect((await ctx.db.get(ids.andrea))?.departmentId).toBeUndefined();
      const dash = await ctx.db.get(ids.onboardingDash);
      expect(dash?.teamIds).toBeUndefined();
      expect(dash?.departmentIds).toEqual([dep("Onboarding")]);
      expect((await ctx.db.get(ids.team))?.archivedAt).toBeDefined();
    });
  });
});
