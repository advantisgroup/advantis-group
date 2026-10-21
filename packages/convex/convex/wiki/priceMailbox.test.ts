/**
 * Preisliste automatisch: nur Admins sehen und setzen das Postfach, ein
 * Abruf mit Tabelle schreibt den Wiki-Eintrag, eine ältere Liste nie.
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
    const admin = await user("boss", { role: "admin" });
    await user("emp");
    const mailboxId = await ctx.db.insert("priceMailbox", {
      email: "chefsache@advantisgroup.de",
      passwordEnc: "enc",
      setBy: admin,
      updatedAt: 1000,
    });
    return { admin, mailboxId };
  });
  return { t, ids };
}

const values = (p: string) => Array.from({ length: 11 }, () => p);
const okResult = (dates: string[], receivedAt = Date.UTC(2026, 9, 21, 5, 55)) => ({
  ok: true as const,
  updatedAt: 1000,
  uidValidity: "7",
  uidNext: 12,
  matched: 1,
  table: {
    receivedAt,
    columns: values("Zone"),
    rows: dates.map((date) => ({ date, values: values("1,908") })),
  },
});

const entry = (t: Awaited<ReturnType<typeof seed>>["t"]) =>
  t.run((ctx) =>
    ctx.db
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", "listenpreise-netto"))
      .unique(),
  );

test("nur Admins sehen das Postfach", async () => {
  const { t } = await seed();
  const status = await t.withIdentity({ subject: "boss" }).query(api.wiki.priceMailbox.status, {});
  expect(status).toMatchObject({ email: "chefsache@advantisgroup.de", setByName: "boss" });
  await expect(
    t.withIdentity({ subject: "emp" }).query(api.wiki.priceMailbox.status, {}),
  ).rejects.toThrow();
  await expect(
    t.withIdentity({ subject: "emp" }).mutation(api.wiki.priceMailbox.remove, {}),
  ).rejects.toThrow();
});

test("ein Abruf mit Tabelle legt den Eintrag an und aktualisiert ihn danach", async () => {
  const { t, ids } = await seed();
  await t.mutation(internal.wiki.priceMailbox.recordPoll, {
    result: okResult(["2026-10-20", "2026-10-21"]),
  });
  const created = await entry(t);
  expect(created).toMatchObject({ version: 1, pinned: true, ownerUserId: ids.admin });
  expect(created?.erklaerung).toContain("Stand: 21.10.2026, 07:55 Uhr");
  const mailbox = await t.run((ctx) => ctx.db.get(ids.mailboxId));
  expect(mailbox).toMatchObject({ uidNext: 12, lastStand: "2026-10-21" });

  await t.run((ctx) => ctx.db.patch(created!._id, { pinned: false }));
  await t.mutation(internal.wiki.priceMailbox.recordPoll, {
    result: okResult(["2026-10-22"], Date.UTC(2026, 9, 22, 5, 50)),
  });
  const updated = await entry(t);
  expect(updated).toMatchObject({ version: 2, pinned: false });
  expect(updated?.erklaerung).toContain("<strong>22.10.2026</strong>");

  // Eine ältere Liste ändert nichts mehr.
  await t.mutation(internal.wiki.priceMailbox.recordPoll, { result: okResult(["2026-10-19"]) });
  expect((await entry(t))?.version).toBe(2);
});

test("ein Ergebnis von einem älteren Postfach-Stand wird verworfen", async () => {
  const { t, ids } = await seed();
  await t.run((ctx) => ctx.db.patch(ids.mailboxId, { updatedAt: 2000 }));
  await t.mutation(internal.wiki.priceMailbox.recordPoll, { result: okResult(["2026-10-21"]) });
  expect(await entry(t)).toBeNull();
});

test("abgelehnte Anmeldung wird einmal gemeldet", async () => {
  const { t, ids } = await seed();
  const failed = { ok: false as const, updatedAt: 1000, error: "auth" as const };
  await t.mutation(internal.wiki.priceMailbox.recordPoll, { result: failed });
  await t.mutation(internal.wiki.priceMailbox.recordPoll, { result: failed });
  const notifications = await t.run((ctx) =>
    ctx.db
      .query("notifications")
      .filter((q) => q.eq(q.field("userId"), ids.admin))
      .collect(),
  );
  expect(notifications).toHaveLength(1);
});
