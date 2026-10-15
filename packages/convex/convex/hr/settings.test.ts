/**
 * The advertised job, the position backfill and the "new application"
 * notification for HR.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function seed() {
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
    const hr = await user("hr", { applicantAccess: true });
    const hr2 = await user("hr2", { applicantAccess: true });
    const gone = await user("gone", { applicantAccess: true, status: "removed" });
    const boss = await user("boss", { role: "admin" });
    const storageId = await ctx.storage.store(new Blob(["%PDF"]));
    return { hr, hr2, gone, boss, storageId };
  });
  return { t, hr: t.withIdentity({ subject: "hr" }), ids };
}

test("only HR sets the advertised job; empty clears it", async () => {
  const { t, hr } = await seed();
  await expect(
    t.withIdentity({ subject: "boss" }).mutation(api.hr.settings.setOpenPosition, {
      openPosition: "Callcenter",
    }),
  ).rejects.toThrow();
  await hr.mutation(api.hr.settings.setOpenPosition, { openPosition: "  Callcenter  " });
  expect(await hr.query(api.hr.settings.get, {})).toEqual({ openPosition: "Callcenter" });
  expect(
    await t.query(api.hr.settings.apiImportDefaults, { serverKey: "test-server-key" }),
  ).toEqual({ openPosition: "Callcenter" });
  await hr.mutation(api.hr.settings.setOpenPosition, { openPosition: " " });
  expect(await hr.query(api.hr.settings.get, {})).toEqual({ openPosition: null });
});

test("an application from the inbox notifies everyone active in HR", async () => {
  const { t, ids } = await seed();
  const create = (notifyHr: boolean) =>
    t.mutation(api.hr.applicants.apiCreateFromExtraction, {
      serverKey: "test-server-key",
      createdByUserId: ids.hr,
      name: "Jana Muster",
      position: "Callcenter",
      notizen: "Laut Lebenslauf: Pflege",
      skills: [],
      storageId: ids.storageId,
      fileName: "cv.pdf",
      notifyHr,
    });
  await create(false);
  const { applicantId } = await create(true);
  const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
  expect(notifications.map((n) => n.userId).sort()).toEqual([ids.hr, ids.hr2].sort());
  expect(notifications[0]).toMatchObject({
    type: "hr_application",
    title: "Neue Bewerbung: Jana Muster",
    link: `/hr/${applicantId}/uebersicht`,
  });
  const applicant = await t.run((ctx) => ctx.db.get(applicantId));
  expect(applicant?.notizen).toBe("Laut Lebenslauf: Pflege");
});

test("the backfill files recent applicants under the job and keeps the CV's", async () => {
  const { t, hr, ids } = await seed();
  const since = Date.parse("2026-10-15T00:00:00+02:00");
  await t.run(async (ctx) => {
    const base = { skills: [], createdByUserId: ids.hr };
    await ctx.db.insert("applicants", {
      ...base,
      name: "Alt",
      position: "Koch",
      createdAt: since - 1,
    });
    await ctx.db.insert("applicants", { ...base, name: "A", position: "Pflege", createdAt: since });
    await ctx.db.insert("applicants", {
      ...base,
      name: "B",
      position: "Bank",
      notizen: "<p>Ruft zurück</p>",
      createdAt: since + 1,
    });
  });
  const args = {
    position: "Callcenter",
    since: "2026-10-15",
    actorEmail: "hr@advantisgroup.de",
  };
  expect(
    await t.mutation(internal.migrations.setApplicantPosition.run, { ...args, dryRun: true }),
  ).toEqual({ applied: false, matched: 2, wouldChange: 2 });
  expect(await t.mutation(internal.migrations.setApplicantPosition.run, args)).toEqual({
    applied: true,
    changed: 2,
  });
  const rows = await t.run((ctx) => ctx.db.query("applicants").collect());
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  expect(byName.Alt).toMatchObject({ position: "Koch" });
  expect(byName.A).toMatchObject({ position: "Callcenter", notizen: "Laut Lebenslauf: Pflege" });
  expect(byName.B).toMatchObject({
    position: "Callcenter",
    notizen: "<p>Laut Lebenslauf: Bank</p><p>Ruft zurück</p>",
  });
  expect(await hr.query(api.hr.settings.get, {})).toEqual({ openPosition: "Callcenter" });
  // Running it again changes nothing.
  expect(await t.mutation(internal.migrations.setApplicantPosition.run, args)).toEqual({
    applied: true,
    changed: 0,
  });
});
