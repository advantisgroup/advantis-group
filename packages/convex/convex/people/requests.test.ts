/**
 * "My requests": only what the signed-in person filed, from every area that
 * takes requests, each mapped to one of four plain states and linked.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const user = (clerkUserId: string) =>
    t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        role: "employee",
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  return { t, alice: await user("alice"), bob: await user("bob") };
}

async function seedAll(t: Awaited<ReturnType<typeof setup>>["t"], owner: Id<"users">, n: number) {
  return t.run(async (ctx) => {
    const now = 1_700_000_000_000 + n;
    const categoryId = await ctx.db.insert("suggestionCategories", {
      name: "Prozesse",
      createdAt: now,
      createdBy: owner,
    });
    const ticket = await ctx.db.insert("itTickets", {
      nr: n,
      category: "Hardware",
      date: "2026-09-01",
      createdByName: "Test",
      createdByUserId: owner,
      status: "bearbeitung",
      topic: "Drucker druckt nicht",
      createdAt: now,
    });
    const suggestion = await ctx.db.insert("suggestions", {
      authorUserId: owner,
      categoryId,
      title: "Kaffeemaschine im 2. Stock",
      status: "closed",
      outcome: "not_possible",
      createdAt: now + 1,
    });
    const error = await ctx.db.insert("errorReports", {
      description: "Falscher Tarif im Angebot",
      severity: "mittel",
      status: "geschlossen",
      effectivenessChecked: true,
      createdByUserId: owner,
      createdAt: now + 2,
    });
    const upload = await ctx.db.insert("onedriveUploads", {
      requesterUserId: owner,
      fileName: "Preisliste.pdf",
      size: 1000,
      contentType: "application/pdf",
      targetFolderPath: "Team",
      scanReport: "{}",
      status: "pending",
      createdAt: now + 3,
    });
    return { ticket, suggestion, error, upload };
  });
}

describe("my requests", () => {
  test("lists only your own requests, newest first, with plain states and links", async () => {
    const { t, alice, bob } = await setup();
    const mine = await seedAll(t, alice, 1);
    await seedAll(t, bob, 2);

    const rows = await t.withIdentity({ subject: "alice" }).query(api.people.requests.mine, {});
    expect(rows.map((r) => [r.kind, r.state, r.href])).toEqual([
      ["upload", "open", "/files"],
      ["error", "done", `/fehlermanagement?open=${mine.error}`],
      ["suggestion", "declined", `/suggestions?open=${mine.suggestion}`],
      ["ticket", "active", `/it-tickets?ticket=${mine.ticket}`],
    ]);
    expect(rows.find((r) => r.kind === "ticket")?.title).toBe("#1 Drucker druckt nicht");
  });

  test("leaves out deleted items", async () => {
    const { t, alice } = await setup();
    const mine = await seedAll(t, alice, 1);
    await t.run((ctx) => ctx.db.patch(mine.ticket, { deletedAt: Date.now() }));
    const rows = await t.withIdentity({ subject: "alice" }).query(api.people.requests.mine, {});
    expect(rows.map((r) => r.kind)).not.toContain("ticket");
  });
});
