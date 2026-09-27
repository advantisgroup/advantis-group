/**
 * Who may read a wiki entry: a managers-only page never reaches an employee,
 * whichever way they look — the list, the page itself, ⌘K search or the AI
 * assistant's retrieval.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function seedUser(t: T, clerkUserId: string, role: "employee" | "manager" | "admin") {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      firstName: clerkUserId,
      role,
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedEntry(
  t: T,
  authorUserId: Id<"users">,
  slug: string,
  thema: string,
  minRole?: "manager" | "admin",
) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("wikiEntries", {
      slug,
      thema,
      erklaerung: `<p>${thema}: Urlaubsanträge genehmigen im Intranet.</p>`,
      tags: [],
      minRole,
      validFrom: now - DAY,
      validUntil: now + 90 * DAY,
      version: 1,
      pinned: false,
      authorUserId,
      authorName: "Admin",
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function seed() {
  const t = setup();
  const admin = await seedUser(t, "admin", "admin");
  await seedUser(t, "manager", "manager");
  await seedUser(t, "employee", "employee");
  const open = await seedEntry(t, admin, "urlaub-beantragen", "Urlaub beantragen");
  const managersOnly = await seedEntry(
    t,
    admin,
    "abwesenheiten-genehmigen",
    "Abwesenheiten genehmigen",
    "manager",
  );
  return { t, open, managersOnly };
}

describe("wiki entry audience", () => {
  test("an employee doesn't see a managers-only entry in the list or on its page", async () => {
    const { t } = await seed();
    const employee = t.withIdentity({ subject: "employee" });
    expect((await employee.query(api.wiki.entries.list, {})).map((e) => e.slug)).toEqual([
      "urlaub-beantragen",
    ]);
    expect(
      await employee.query(api.wiki.entries.get, { slug: "abwesenheiten-genehmigen" }),
    ).toBeNull();
  });

  test("a manager sees both", async () => {
    const { t } = await seed();
    const manager = t.withIdentity({ subject: "manager" });
    expect(await manager.query(api.wiki.entries.list, {})).toHaveLength(2);
    expect(
      await manager.query(api.wiki.entries.get, { slug: "abwesenheiten-genehmigen" }),
    ).toMatchObject({ minRole: "manager" });
  });

  test("the AI assistant only draws on entries the asker may read", async () => {
    const { t } = await seed();
    const ask = (clerkUserId: string) =>
      t.query(api.wiki.entries.apiSearchForAssistant, {
        serverKey,
        clerkUserId,
        question: "Urlaub beantragen oder genehmigen",
      });
    expect((await ask("employee")).map((h) => h.title)).toEqual(["Urlaub beantragen"]);
    expect(await ask("manager")).toHaveLength(2);
  });

  test("⌘K search leaves managers-only entries out for employees", async () => {
    const { t } = await seed();
    const search = (clerkUserId: string) =>
      t.query(api.aiRuns.apiNavigateSearch, {
        serverKey,
        clerkUserId,
        kind: "wiki",
        query: "genehmigen",
      });
    expect((await search("employee")).map((h) => h.title)).not.toContain(
      "Abwesenheiten genehmigen",
    );
    expect((await search("manager")).map((h) => h.title)).toContain("Abwesenheiten genehmigen");
  });

  test("saving the form without an audience opens the entry to everyone again", async () => {
    const { t, managersOnly } = await seed();
    const admin = t.withIdentity({ subject: "admin" });
    const entry = await admin.query(api.wiki.entries.get, { slug: "abwesenheiten-genehmigen" });
    if (!entry) throw new Error("seeded entry missing");
    await admin.mutation(api.wiki.entries.update, {
      entryId: managersOnly,
      thema: entry.thema,
      erklaerung: entry.erklaerung,
      tags: entry.tags,
      validFrom: entry.validFrom,
      validUntil: entry.validUntil,
    });
    expect(await t.run((ctx) => ctx.db.get(managersOnly))).not.toHaveProperty("minRole");
    const employee = t.withIdentity({ subject: "employee" });
    expect(await employee.query(api.wiki.entries.list, {})).toHaveLength(2);
  });

  test("clearing the link in the form removes it", async () => {
    const { t, open } = await seed();
    await t.run((ctx) => ctx.db.patch(open, { link: "https://example.com/alt" }));
    const admin = t.withIdentity({ subject: "admin" });
    const entry = await admin.query(api.wiki.entries.get, { slug: "urlaub-beantragen" });
    if (!entry) throw new Error("seeded entry missing");
    await admin.mutation(api.wiki.entries.update, {
      entryId: open,
      thema: entry.thema,
      erklaerung: entry.erklaerung,
      tags: entry.tags,
      validFrom: entry.validFrom,
      validUntil: entry.validUntil,
    });
    expect(await t.run((ctx) => ctx.db.get(open))).not.toHaveProperty("link");
  });
});
