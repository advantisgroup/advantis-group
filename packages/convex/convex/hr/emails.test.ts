/**
 * Applicant mail templates and the log of mail sent from the HR mailbox.
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
    await user("boss", { role: "admin" });
    const applicantId = await ctx.db.insert("applicants", {
      name: "Jana Muster",
      email: "jana@example.com",
      skills: [],
      createdByUserId: hr,
      createdAt: 0,
    });
    return { hr, applicantId };
  });
  return { t, hr: t.withIdentity({ subject: "hr" }), ids };
}

test("starting drafts are created once and never over HR's own templates", async () => {
  const { hr } = await seed();
  expect(await hr.mutation(api.hr.emails.createDefaultTemplates, {})).toEqual({ created: 3 });
  expect(await hr.mutation(api.hr.emails.createDefaultTemplates, {})).toEqual({ created: 0 });
  const templates = await hr.query(api.hr.emails.listTemplates, {});
  expect(templates.map((row) => row.kategorie).sort()).toEqual([
    "absage",
    "einladung",
    "telefonisch_nicht_erreicht",
  ]);
});

test("templates are HR-only and need a subject and text", async () => {
  const { t, hr } = await seed();
  await expect(
    t.withIdentity({ subject: "boss" }).query(api.hr.emails.listTemplates, {}),
  ).rejects.toThrow();
  await expect(
    hr.mutation(api.hr.emails.saveTemplate, {
      name: "Leer",
      kategorie: "sonstiges",
      subject: " ",
      body: "Hallo",
    }),
  ).rejects.toThrow(/Betreff/);
  const id = await hr.mutation(api.hr.emails.saveTemplate, {
    name: "Rückruf",
    kategorie: "sonstiges",
    subject: "Rückruf",
    body: "Hallo {Vorname}",
  });
  await hr.mutation(api.hr.emails.saveTemplate, {
    templateId: id,
    name: "Rückruf",
    kategorie: "sonstiges",
    subject: "Bitte um Rückruf",
    body: "Hallo {Vorname}",
  });
  const [row] = await hr.query(api.hr.emails.listTemplates, {});
  expect(row.subject).toBe("Bitte um Rückruf");
});

test("send context names the recipient and the HR mailbox, if there is one", async () => {
  const { t, ids } = await seed();
  const ctxFor = () =>
    t.query(api.hr.emails.apiSendContext, {
      serverKey: "test-server-key",
      clerkUserId: "hr",
      applicantId: ids.applicantId,
    });
  expect(await ctxFor()).toEqual({ to: "jana@example.com", name: "Jana Muster", mailbox: null });
  await t.run((ctx) =>
    ctx.db.insert("hrMailbox", {
      email: "bewerbung@advantisgroup.de",
      passwordEnc: "enc",
      setBy: ids.hr,
      updatedAt: 1,
    }),
  );
  expect((await ctxFor()).mailbox).toEqual({
    email: "bewerbung@advantisgroup.de",
    passwordEnc: "enc",
  });
});

test("a sent mail is logged in the applicant's history with what was sent", async () => {
  const { t, hr, ids } = await seed();
  await t.mutation(api.hr.emails.apiRecordSent, {
    serverKey: "test-server-key",
    clerkUserId: "hr",
    applicantId: ids.applicantId,
    kategorie: "einladung",
    subject: "Einladung",
    body: "Hallo Jana",
    sentFrom: "bewerbung@advantisgroup.de",
    to: "jana@example.com",
  });
  const detail = await hr.query(api.hr.applicants.get, { applicantId: ids.applicantId });
  expect(detail.emails).toMatchObject([
    {
      kategorie: "einladung",
      subject: "Einladung",
      notiz: "Hallo Jana",
      sentFrom: "bewerbung@advantisgroup.de",
      sentBy: ids.hr,
    },
  ]);
});
