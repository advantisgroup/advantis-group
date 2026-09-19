import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { APPLICANT_RETENTION_DAYS } from "./lib/retention";

const DAY_MS = 86_400_000;

test("only archived, never-hired applicants past the window without consent are deleted", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const old = now - (APPLICANT_RETENTION_DAYS + 1) * DAY_MS;

  const ids = await t.run(async (ctx) => {
    const createdByUserId = await ctx.db.insert("users", {
      clerkUserId: "hr",
      email: "hr@advantisgroup.de",
      role: "admin",
      status: "active",
      createdAt: 0,
    });
    const employeeProfileId = await ctx.db.insert("employeeProfiles", {
      name: "Hired",
      status: "active",
      createdByUserId,
      createdAt: 0,
      updatedAt: 0,
    });
    const applicant = (name: string, extra: Record<string, unknown>) =>
      ctx.db.insert("applicants", {
        name,
        skills: [],
        createdByUserId,
        createdAt: 0,
        ...extra,
      });
    const expired = await applicant("Expired", { archivedAt: old });
    await ctx.db.insert("applicantContacts", {
      applicantId: expired,
      datum: "2026-01-01",
      art: "telefon",
      createdAt: 0,
    });
    return {
      expired,
      recent: await applicant("Recent", { archivedAt: now - DAY_MS }),
      consented: await applicant("Consented", { archivedAt: old, poolConsentUntil: now + DAY_MS }),
      consentRanOut: await applicant("Lapsed", { archivedAt: old, poolConsentUntil: now - DAY_MS }),
      hired: await applicant("Hired", {
        archivedAt: old,
        convertedEmployeeProfileId: employeeProfileId,
      }),
      active: await applicant("Active", {}),
    };
  });

  expect(await t.mutation(internal.hr.retention.purgeExpiredApplicants, {})).toEqual({ purged: 2 });

  const left = await t.run(async (ctx) => {
    const exists = async (id: Id<"applicants">) => (await ctx.db.get(id)) !== null;
    return {
      expired: await exists(ids.expired),
      consentRanOut: await exists(ids.consentRanOut),
      recent: await exists(ids.recent),
      consented: await exists(ids.consented),
      hired: await exists(ids.hired),
      active: await exists(ids.active),
      contacts: (await ctx.db.query("applicantContacts").collect()).length,
    };
  });
  expect(left).toEqual({
    expired: false,
    consentRanOut: false,
    recent: true,
    consented: true,
    hired: true,
    active: true,
    contacts: 0,
  });
});
