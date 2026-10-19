/** Wiki-Aufräumen: neun Anleitungen ins Archiv, Zeiterfassungs-Anleitung neu, wiederholbar. */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { ARCHIVE_SLUGS, TIME_GUIDE_SLUG } from "./wikiCleanupOct2026";

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "owner",
      email: "owner@advantisgroup.de",
      firstName: "Owner",
      role: "admin",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
  await t.mutation(internal.migrations.moveGuidesToWiki.run, { ownerEmail: "owner@advantisgroup.de" });
  return t;
}

describe("wiki cleanup Oct 2026", () => {
  test("archives the nine guides and adds the time-tracking guide", async () => {
    const t = await setup();
    const result = await t.mutation(internal.migrations.wikiCleanupOct2026.run, {
      ownerEmail: "owner@advantisgroup.de",
    });
    expect(result.archived.sort()).toEqual([...ARCHIVE_SLUGS].sort());
    expect(result.timeGuide).toBe("created");

    const now = Date.now();
    const entries = await t.run((ctx) => ctx.db.query("wikiEntries").collect());
    for (const slug of ARCHIVE_SLUGS) {
      const e = entries.find((x) => x.slug === slug);
      expect(e?.validUntil).toBeLessThanOrEqual(now);
      expect(e?.deletedAt).toBeUndefined();
    }
    expect(entries.find((e) => e.slug === "problembehandlungen")!.validUntil).toBeGreaterThan(now);
    const guide = entries.find((e) => e.slug === TIME_GUIDE_SLUG)!;
    expect(guide.validUntil).toBeGreaterThan(now);
    const category = await t.run((ctx) => ctx.db.get(guide.categoryId!));
    expect(category?.name).toBe("Zeit & Konto");

    const again = await t.mutation(internal.migrations.wikiCleanupOct2026.run, {
      ownerEmail: "owner@advantisgroup.de",
    });
    expect(again.archived).toEqual([]);
    expect(again.timeGuide).toBe("exists");
  });
});
