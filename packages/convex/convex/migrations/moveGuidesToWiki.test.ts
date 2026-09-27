/**
 * The built-in guides move into the wiki once, keep their slugs and their
 * managers-only restriction, and a second run changes nothing.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { BUILTIN_GUIDES } from "../wiki/builtinGuides";

async function setup() {
  const t = convexTest(schema, modules);
  const insertUser = (clerkUserId: string, role: "employee" | "admin") =>
    t.run((ctx) =>
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
  const ownerId = await insertUser("owner", "admin");
  await insertUser("employee", "employee");
  await t.run((ctx) =>
    ctx.db.insert("guidebookHighlights", {
      slug: "onboarding",
      highlightedByUserId: ownerId,
      highlightedAt: Date.now(),
    }),
  );
  return { t, ownerId };
}

describe("move guides to wiki", () => {
  test("creates one entry per guide, owned by the given person", async () => {
    const { t, ownerId } = await setup();
    const result = await t.mutation(internal.migrations.moveGuidesToWiki.run, {
      ownerEmail: "owner@advantisgroup.de",
    });
    expect(result.created).toHaveLength(BUILTIN_GUIDES.length);
    expect(result.skipped).toEqual([]);

    const entries = await t.run((ctx) => ctx.db.query("wikiEntries").collect());
    expect(entries.map((e) => e.slug).sort()).toEqual(BUILTIN_GUIDES.map((g) => g.slug).sort());
    expect(entries.every((e) => e.ownerUserId === ownerId && e.categoryId)).toBe(true);
    expect(entries.find((e) => e.slug === "onboarding")?.pinned).toBe(true);
    expect(
      entries
        .filter((e) => e.minRole === "manager")
        .map((e) => e.slug)
        .sort(),
    ).toEqual([
      "abwesenheiten-genehmigen",
      "ankuendigungen-termine",
      "uploads-genehmigen",
      "verwaltung-mitglieder",
    ]);
  });

  test("files guides under the topic categories, reusing ones that exist", async () => {
    const { t, ownerId } = await setup();
    const onboarding = await t.run((ctx) =>
      ctx.db.insert("wikiCategories", {
        name: "Onboarding",
        color: "#4E8A3C",
        createdByUserId: ownerId,
        createdAt: Date.now(),
      }),
    );
    await t.mutation(internal.migrations.moveGuidesToWiki.run, {
      ownerEmail: "owner@advantisgroup.de",
    });
    const categories = await t.run((ctx) => ctx.db.query("wikiCategories").collect());
    expect(categories.map((c) => c.name).sort()).toEqual([
      "IT & Arbeitsplatz",
      "Management",
      "Onboarding",
      "Zeit & Konto",
      "Zusammenarbeit",
    ]);
    const entry = await t.run((ctx) =>
      ctx.db
        .query("wikiEntries")
        .withIndex("by_slug", (q) => q.eq("slug", "onboarding"))
        .unique(),
    );
    expect(entry?.categoryId).toBe(onboarding);
  });

  test("an employee doesn't get the managers-only guides", async () => {
    const { t } = await setup();
    await t.mutation(internal.migrations.moveGuidesToWiki.run, {
      ownerEmail: "owner@advantisgroup.de",
    });
    const visible = await t.withIdentity({ subject: "employee" }).query(api.wiki.entries.list, {});
    expect(visible).toHaveLength(BUILTIN_GUIDES.length - 4);
  });

  test("a second run skips every guide", async () => {
    const { t } = await setup();
    const args = { ownerEmail: "owner@advantisgroup.de" };
    await t.mutation(internal.migrations.moveGuidesToWiki.run, args);
    const again = await t.mutation(internal.migrations.moveGuidesToWiki.run, args);
    expect(again.created).toEqual([]);
    expect(again.skipped).toHaveLength(BUILTIN_GUIDES.length);
  });

  test("refuses an owner who isn't an active user", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.migrations.moveGuidesToWiki.run, { ownerEmail: "nobody@example.com" }),
    ).rejects.toThrow("Owner must be an active user");
  });
});
