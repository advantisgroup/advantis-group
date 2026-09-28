/**
 * Policies: everyone confirms they've read them, and confirms again only
 * when an editor says a change matters.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const t = convexTest(schema, modules);
  for (const [clerkUserId, role] of [
    ["admin", "admin"],
    ["alice", "employee"],
    ["bob", "employee"],
  ] as const) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  const admin = t.withIdentity({ subject: "admin" });
  const now = Date.now();
  const fields = {
    thema: "Datenschutz-Richtlinie",
    erklaerung: "<p>Keine Kundendaten in private Mails.</p>",
    tags: [],
    validFrom: now - DAY,
    validUntil: now + 365 * DAY,
  };
  const { id } = await admin.mutation(api.wiki.entries.create, {
    slug: "datenschutz",
    ...fields,
    policy: true,
  });
  return { t, admin, alice: t.withIdentity({ subject: "alice" }), id, fields };
}

describe("policies", () => {
  test("a new policy is pending until confirmed", async () => {
    const { alice } = await setup();
    expect((await alice.query(api.wiki.policies.pendingMine, {})).map((p) => p.state)).toEqual([
      "pending",
    ]);
    await alice.mutation(api.guidebooks.reads.markRead, { slug: "datenschutz" });
    expect(await alice.query(api.wiki.policies.pendingMine, {})).toEqual([]);
  });

  test("an ordinary edit keeps confirmations; asking again reopens them", async () => {
    const { admin, alice, id, fields } = await setup();
    await alice.mutation(api.guidebooks.reads.markRead, { slug: "datenschutz" });

    await admin.mutation(api.wiki.entries.update, { entryId: id, ...fields, policy: true });
    expect(await alice.query(api.wiki.policies.pendingMine, {})).toEqual([]);

    await admin.mutation(api.wiki.entries.update, {
      entryId: id,
      ...fields,
      policy: true,
      askAgain: true,
    });
    expect((await alice.query(api.wiki.policies.pendingMine, {})).map((p) => p.state)).toEqual([
      "changed",
    ]);
    expect(await alice.query(api.guidebooks.reads.listMine, {})).toEqual([]);

    await alice.mutation(api.guidebooks.reads.markRead, { slug: "datenschutz" });
    expect(await alice.query(api.guidebooks.reads.listMine, {})).toEqual(["datenschutz"]);
  });

  test("editors see how many colleagues confirmed the current version", async () => {
    const { admin, alice } = await setup();
    await alice.mutation(api.guidebooks.reads.markRead, { slug: "datenschutz" });
    const [policy] = await admin.query(api.wiki.policies.list, {});
    expect(policy).toMatchObject({ confirmedCount: 1, audienceCount: 3, version: 1 });
    const [asAlice] = await alice.query(api.wiki.policies.list, {});
    expect(asAlice).toMatchObject({ state: "confirmed", confirmedCount: null });
  });

  test("turning the policy off takes it out of the library", async () => {
    const { admin, id, fields } = await setup();
    await admin.mutation(api.wiki.entries.update, { entryId: id, ...fields });
    expect(await admin.query(api.wiki.policies.list, {})).toEqual([]);
  });

  test("a managers-only policy stays out of employees' library and dashboard", async () => {
    const { admin, alice, fields } = await setup();
    await admin.mutation(api.wiki.entries.create, {
      slug: "freigaben",
      ...fields,
      thema: "Freigabe-Richtlinie",
      minRole: "manager",
      policy: true,
    });
    expect((await alice.query(api.wiki.policies.list, {})).map((p) => p.slug)).toEqual([
      "datenschutz",
    ]);
    expect((await alice.query(api.wiki.policies.pendingMine, {})).map((p) => p.slug)).toEqual([
      "datenschutz",
    ]);
    // Only the admin can see it, so only the admin is counted.
    const restricted = (await admin.query(api.wiki.policies.list, {})).find(
      (p) => p.slug === "freigaben",
    );
    expect(restricted).toMatchObject({ audienceCount: 1, confirmedCount: 0 });
  });
});
