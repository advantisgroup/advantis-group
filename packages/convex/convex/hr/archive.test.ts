/**
 * The Bewerber-Archiv: who shows up there, when they go, and taking them back.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { APPLICANT_RETENTION_DAYS } from "./lib/retention";

const DAY_MS = 86_400_000;

async function seed() {
  const t = convexTest(schema, modules);
  const now = Date.now();
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
    await user("sales");
    const employeeProfileId = await ctx.db.insert("employeeProfiles", {
      name: "Hired",
      status: "active",
      createdByUserId: hr,
      createdAt: 0,
      updatedAt: 0,
    });
    const applicant = (name: string, extra: Record<string, unknown>) =>
      ctx.db.insert("applicants", {
        name,
        skills: [],
        createdByUserId: hr,
        createdAt: 0,
        ...extra,
      });
    return {
      archived: await applicant("Archiviert", { archivedAt: now - 10 * DAY_MS }),
      consented: await applicant("Pool", {
        archivedAt: now - DAY_MS,
        poolConsentUntil: now + 400 * DAY_MS,
      }),
      hired: await applicant("Eingestellt", {
        archivedAt: now,
        convertedEmployeeProfileId: employeeProfileId,
      }),
      active: await applicant("Aktiv", {}),
    };
  });
  return { t, now, ids, hr: t.withIdentity({ subject: "hr" }) };
}

test("the archive lists archived, never-hired applicants with their deletion date", async () => {
  const { now, ids, hr } = await seed();
  const rows = await hr.query(api.hr.archive.list, {});
  expect(rows.map((r) => r.name).sort()).toEqual(["Archiviert", "Pool"]);

  const archived = rows.find((r) => r._id === ids.archived)!;
  expect(archived.deletesAt).toBe(archived.archivedAt + APPLICANT_RETENTION_DAYS * DAY_MS);
  // Consent that runs past the usual six months pushes the date out.
  const consented = rows.find((r) => r._id === ids.consented)!;
  expect(consented.deletesAt).toBe(consented.poolConsentUntil);
  expect(consented.deletesAt).toBeGreaterThan(now + 399 * DAY_MS);
});

test("restoring puts the applicant back in the recruiting list", async () => {
  const { ids, hr } = await seed();
  await hr.mutation(api.hr.archive.restore, { applicantId: ids.archived });

  expect((await hr.query(api.hr.archive.list, {})).map((r) => r.name)).toEqual(["Pool"]);
  const active = await hr.query(api.hr.applicants.list, {});
  expect(active.map((a) => a.name).sort()).toEqual(["Aktiv", "Archiviert"]);
});

test("hired applicants are not restored from the archive", async () => {
  const { ids, hr } = await seed();
  await expect(hr.mutation(api.hr.archive.restore, { applicantId: ids.hired })).rejects.toThrow();
});

test("only HR can see or restore the archive", async () => {
  const { t, ids } = await seed();
  const sales = t.withIdentity({ subject: "sales" });
  await expect(sales.query(api.hr.archive.list, {})).rejects.toThrow();
  await expect(
    sales.mutation(api.hr.archive.restore, { applicantId: ids.archived }),
  ).rejects.toThrow();
});
