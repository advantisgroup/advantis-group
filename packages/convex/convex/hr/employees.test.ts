import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkUserId: string, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId[0].toUpperCase() + clerkUserId.slice(1),
        role: "employee",
        status: "active",
        createdAt: 0,
        ...extra,
      });
    const hr = await user("hr", { applicantAccess: true });
    await ctx.db.insert("applicantVaultUnlocks", {
      userId: hr,
      unlockedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    const alice = await user("alice", { jobTitle: "Support", department: "Service" });
    const bob = await user("bob", { jobTitle: "Vertrieb" });
    const carol = await user("carol");
    await user("dave", { status: "removed" });
    const record = (name: string, extra: Record<string, unknown>) =>
      ctx.db.insert("employeeProfiles", {
        name,
        status: "active",
        createdByUserId: hr,
        createdAt: 0,
        updatedAt: 0,
        ...extra,
      });
    const bobRecord = await record("Robert", { email: "BOB@advantisgroup.de", jobTitle: "Sales" });
    const carolRecord = await record("Carol", { userId: carol });
    const hrRecord = await record("HR", { userId: hr });
    return { hr, alice, bob, carol, bobRecord, carolRecord, hrRecord };
  });
  return { t: t.withIdentity({ subject: "hr" }), raw: t, ids };
}

test("candidates are active members without a record, matched by email to unlinked ones", async () => {
  const { t, ids } = await seed();
  const candidates = await t.query(api.hr.employees.backfillCandidates, {});
  expect(candidates.map((c) => [c.name, c.matchedEmployee?._id ?? null])).toEqual([
    ["Alice", null],
    ["Bob", ids.bobRecord],
  ]);
});

test("backfill creates new records and links matched ones without overwriting HR's data", async () => {
  const { t, raw, ids } = await seed();
  const result = await t.mutation(api.hr.employees.backfillFromIntranet, {
    userIds: [ids.alice, ids.bob, ids.carol],
  });
  expect(result).toEqual({ created: 1, linked: 1 });

  const records = await raw.run((ctx) => ctx.db.query("employeeProfiles").collect());
  const byUser = (userId: Id<"users">) => records.filter((r) => r.userId === userId);
  expect(byUser(ids.alice)).toMatchObject([
    { name: "Alice", email: "alice@advantisgroup.de", jobTitle: "Support", department: "Service" },
  ]);
  expect(byUser(ids.bob)).toMatchObject([
    { _id: ids.bobRecord, name: "Robert", jobTitle: "Sales" },
  ]);
  expect(byUser(ids.carol)).toHaveLength(1);
  expect(await t.query(api.hr.employees.backfillCandidates, {})).toEqual([]);
});

test("an account can only be linked to one record", async () => {
  const { t, ids } = await seed();
  await expect(
    t.mutation(api.hr.employees.updateProfile, {
      employeeProfileId: ids.bobRecord,
      userId: ids.carol,
    }),
  ).rejects.toThrow(/Already linked/);
  await t.mutation(api.hr.employees.updateProfile, {
    employeeProfileId: ids.carolRecord,
    userId: ids.carol,
  });
});
