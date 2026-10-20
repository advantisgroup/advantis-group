/** Länderliste wird angelegt, angeheftet und beim zweiten Lauf aktualisiert. */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { FOREIGN_QUEUES_SLUG } from "./addForeignQueues";

describe("add foreign queues entry", () => {
  test("creates a pinned entry, second run bumps the version", async () => {
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
    const args = { ownerEmail: "owner@advantisgroup.de" };
    expect((await t.mutation(internal.migrations.addForeignQueues.run, args)).result).toBe(
      "created",
    );
    expect((await t.mutation(internal.migrations.addForeignQueues.run, args)).result).toBe(
      "updated",
    );
    const entries = await t.run((ctx) => ctx.db.query("wikiEntries").collect());
    const entry = entries.find((e) => e.slug === FOREIGN_QUEUES_SLUG)!;
    expect(entry.pinned).toBe(true);
    expect(entry.version).toBe(2);
    expect(entry.erklaerung).toContain("Austria");
  });
});
