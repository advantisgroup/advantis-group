/**
 * The HR mailbox: only HR sees it, imports run as whoever set it up (and stop
 * when that person leaves HR), and a poll result only moves the position of
 * the mailbox it was read from.
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
    const admin = await user("boss", { role: "admin" });
    const mailboxId = await ctx.db.insert("hrMailbox", {
      email: "bewerbung@advantisgroup.de",
      passwordEnc: "enc",
      setBy: hr,
      updatedAt: 1000,
    });
    return { hr, admin, mailboxId };
  });
  return { t, ids };
}

const okResult = (updatedAt: number) => ({
  ok: true as const,
  updatedAt,
  uidValidity: "7",
  uidNext: 12,
  imports: [
    {
      uid: 10,
      from: "Indeed",
      subject: "Neue Bewerbung: Jana Muster",
      receivedAt: 5000,
      status: "started" as const,
      fileName: "CV.pdf",
      runId: null,
      error: null,
    },
    {
      uid: 11,
      from: "Indeed",
      subject: "Neue Bewerbung: Max",
      receivedAt: 6000,
      status: "no_pdf" as const,
      fileName: null,
      runId: null,
      error: null,
    },
  ],
});

test("only HR sees the mailbox — an admin off the HR list does not", async () => {
  const { t } = await seed();
  const status = await t.withIdentity({ subject: "hr" }).query(api.hr.mailbox.status, {});
  expect(status.mailbox).toMatchObject({ email: "bewerbung@advantisgroup.de", setByName: "hr" });
  await expect(
    t.withIdentity({ subject: "boss" }).query(api.hr.mailbox.status, {}),
  ).rejects.toThrow();
});

test("imports run as the person who set it up, and stop once they leave HR", async () => {
  const { t, ids } = await seed();
  expect(await t.query(internal.hr.mailbox.pollTarget, {})).toMatchObject({
    email: "bewerbung@advantisgroup.de",
    clerkUserId: "hr",
    userId: ids.hr,
    uidValidity: null,
    uidNext: null,
  });
  await t.run((ctx) => ctx.db.patch(ids.hr, { applicantAccess: false }));
  expect(await t.query(internal.hr.mailbox.pollTarget, {})).toBeNull();
});

test("a poll logs each mail and moves the position", async () => {
  const { t, ids } = await seed();
  await t.mutation(internal.hr.mailbox.recordPoll, { result: okResult(1000) });
  const mailbox = await t.run((ctx) => ctx.db.get(ids.mailboxId));
  expect(mailbox).toMatchObject({ uidValidity: "7", uidNext: 12 });
  const status = await t.withIdentity({ subject: "hr" }).query(api.hr.mailbox.status, {});
  expect(status.imports.map((row) => row.status).sort()).toEqual(["no_pdf", "started"]);
});

test("a result read before the mailbox was re-set keeps its log but not its position", async () => {
  const { t, ids } = await seed();
  await t.run((ctx) => ctx.db.patch(ids.mailboxId, { updatedAt: 2000 }));
  await t.mutation(internal.hr.mailbox.recordPoll, { result: okResult(1000) });
  const mailbox = await t.run((ctx) => ctx.db.get(ids.mailboxId));
  expect(mailbox?.uidNext).toBeUndefined();
  const rows = await t.run((ctx) => ctx.db.query("hrMailboxImports").collect());
  expect(rows).toHaveLength(2);
});

test("a rejected login is recorded once", async () => {
  const { t, ids } = await seed();
  const failed = { ok: false as const, updatedAt: 1000, error: "auth" as const };
  await t.mutation(internal.hr.mailbox.recordPoll, { result: failed });
  await t.mutation(internal.hr.mailbox.recordPoll, { result: failed });
  const mailbox = await t.run((ctx) => ctx.db.get(ids.mailboxId));
  expect(mailbox?.error).toBe("auth");
  const notifications = await t.run((ctx) =>
    ctx.db
      .query("notifications")
      .filter((q) => q.eq(q.field("userId"), ids.admin))
      .collect(),
  );
  expect(notifications).toHaveLength(1);
});
