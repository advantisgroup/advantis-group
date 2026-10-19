/**
 * Editing Termine and Verlauf entries after they were logged.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
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
    await user("sales");
    const applicantId = await ctx.db.insert("applicants", {
      name: "Jana Muster",
      skills: [],
      createdByUserId: hr,
      createdAt: 0,
    });
    const terminId = await ctx.db.insert("applicantAppointments", {
      applicantId,
      datum: "2026-10-22",
      uhrzeit: "09:00",
      art: "vor_ort",
      typ: "probetag",
      notiz: "Ausweis",
      uebernommen: false,
      createdAt: 0,
    });
    const kontaktId = await ctx.db.insert("applicantContacts", {
      applicantId,
      datum: "2026-10-15",
      art: "telefon",
      notiz: "ne",
      createdAt: 0,
    });
    const sentMailId = await ctx.db.insert("applicantEmails", {
      applicantId,
      datum: "2026-10-15",
      kategorie: "einladung",
      sentBy: hr,
      createdAt: 0,
    });
    return { hr, applicantId, terminId, kontaktId, sentMailId };
  });
  return { t, hr: t.withIdentity({ subject: "hr" }), ids };
}

test("moving a Termin keeps where it was and stamps the edit", async () => {
  const { t, hr, ids } = await seed();
  await hr.mutation(api.hr.applicants.updateTermin, {
    terminId: ids.terminId,
    datum: "2026-10-23",
    uhrzeit: "10:30",
    art: "vor_ort",
    typ: "probetag",
    notiz: "  Auf Wunsch verschoben  ",
  });
  const termin = await t.run((ctx) => ctx.db.get(ids.terminId));
  expect(termin).toMatchObject({
    datum: "2026-10-23",
    uhrzeit: "10:30",
    notiz: "Auf Wunsch verschoben",
    verschobenVon: "2026-10-22 09:00",
    editedBy: ids.hr,
  });

  // Only the note changes: no new "moved from".
  await hr.mutation(api.hr.applicants.updateTermin, {
    terminId: ids.terminId,
    datum: "2026-10-23",
    uhrzeit: "10:30",
    art: "vor_ort",
    typ: "probetag",
  });
  const again = await t.run((ctx) => ctx.db.get(ids.terminId));
  expect(again?.verschobenVon).toBe("2026-10-22 09:00");
  expect(again?.notiz).toBeUndefined();
});

test("bad dates and times are refused", async () => {
  const { hr, ids } = await seed();
  const base = { terminId: ids.terminId, art: "vor_ort", typ: "probetag" } as const;
  await expect(
    hr.mutation(api.hr.applicants.updateTermin, { ...base, datum: "22.10.2026", uhrzeit: "09:00" }),
  ).rejects.toThrow();
  await expect(
    hr.mutation(api.hr.applicants.updateTermin, { ...base, datum: "2026-10-22", uhrzeit: "25:00" }),
  ).rejects.toThrow();
});

test("a contact entry can be corrected, but only by HR", async () => {
  const { t, hr, ids } = await seed();
  const args = {
    kontaktId: ids.kontaktId,
    datum: "2026-10-16",
    art: "telefon" as const,
    notiz: "Nicht erreicht, Mailbox",
  };
  await expect(
    t.withIdentity({ subject: "sales" }).mutation(api.hr.applicants.updateKontakt, args),
  ).rejects.toThrow();
  await hr.mutation(api.hr.applicants.updateKontakt, args);
  const kontakt = await t.run((ctx) => ctx.db.get(ids.kontaktId));
  expect(kontakt).toMatchObject({ datum: "2026-10-16", notiz: "Nicht erreicht, Mailbox" });
  const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
  expect(audit.map((a) => a.action)).toContain("hr_entry_edited");
});

test("a sent mail keeps its date, its note can change", async () => {
  const { t, hr, ids } = await seed();
  await expect(
    hr.mutation(api.hr.applicants.updateEmail, {
      emailId: ids.sentMailId,
      datum: "2026-10-14",
      kategorie: "einladung",
    }),
  ).rejects.toThrow();
  await hr.mutation(api.hr.applicants.updateEmail, {
    emailId: ids.sentMailId,
    datum: "2026-10-15",
    kategorie: "einladung",
    notiz: "Für Do",
  });
  expect((await t.run((ctx) => ctx.db.get(ids.sentMailId)))?.notiz).toBe("Für Do");
});
