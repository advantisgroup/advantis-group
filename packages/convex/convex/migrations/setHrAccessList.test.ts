/**
 * The fixed HR list: listed people get access, everyone else (admins and
 * delegates included) loses it, and a typo applies nothing.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkUserId: string, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId,
        role: "employee",
        status: "active",
        createdAt: 0,
        ...extra,
      });
    const keep = await user("keep", { role: "admin" });
    const already = await user("already", { applicantAccess: true });
    const otherAdmin = await user("boss", { role: "admin", applicantAccess: true });
    const delegate = await user("delegate", { applicantAccessDelegate: true });
    await ctx.db.insert("applicantVaultPasswords", { userId: keep, hash: "h", updatedAt: 0 });
    await ctx.db.insert("applicantVaultUnlocks", { userId: keep, unlockedAt: 0, expiresAt: 1 });
    return { keep, already, otherAdmin, delegate };
  });
  return { t, ids };
}

const listed = ["Keep@advantisgroup.de", "already@advantisgroup.de"];

test("dry run reports and changes nothing", async () => {
  const { t, ids } = await setup();
  const result = await t.mutation(internal.migrations.setHrAccessList.run, {
    emails: listed,
    dryRun: true,
  });
  expect(result).toMatchObject({ applied: false, granted: ["keep"] });
  expect(result.revoked).toEqual(expect.arrayContaining(["boss", "delegate"]));
  const keep = await t.run((ctx) => ctx.db.get(ids.keep));
  expect(keep?.applicantAccess).toBeUndefined();
});

test("sets exactly the listed people and clears the vault", async () => {
  const { t, ids } = await setup();
  const result = await t.mutation(internal.migrations.setHrAccessList.run, { emails: listed });
  expect(result.applied).toBe(true);
  await t.run(async (ctx) => {
    expect((await ctx.db.get(ids.keep))?.applicantAccess).toBe(true);
    expect((await ctx.db.get(ids.already))?.applicantAccess).toBe(true);
    expect((await ctx.db.get(ids.otherAdmin))?.applicantAccess).toBe(false);
    expect((await ctx.db.get(ids.delegate))?.applicantAccessDelegate).toBe(false);
    expect(await ctx.db.query("applicantVaultPasswords").collect()).toHaveLength(0);
    expect(await ctx.db.query("applicantVaultUnlocks").collect()).toHaveLength(0);
  });
});

test("an unknown email applies nothing", async () => {
  const { t, ids } = await setup();
  const result = await t.mutation(internal.migrations.setHrAccessList.run, {
    emails: [...listed, "typo@advantisgroup.de"],
  });
  expect(result).toEqual({ applied: false, notFound: ["typo@advantisgroup.de"] });
  const boss = await t.run((ctx) => ctx.db.get(ids.otherAdmin));
  expect(boss?.applicantAccess).toBe(true);
});
