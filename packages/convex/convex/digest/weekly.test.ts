/**
 * The weekly digest: each person gets what's meant for them, people who
 * opted out (or externals who never opted in) get nothing, and nobody gets
 * an empty email.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 5, 6, 50);

async function setup() {
  const t = convexTest(schema, modules);
  const user = (clerkUserId: string, extra: { external?: boolean; department?: string } = {}) =>
    t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId,
        role: "employee",
        status: "active",
        external: extra.external ?? false,
        department: extra.department,
        createdAt: NOW - 100 * DAY,
      }),
    );
  const sales = await user("sales", { department: "Sales" });
  const care = await user("care", { department: "Care" });
  const optedOut = await user("optedout");
  await user("external", { external: true });
  await t.run(async (ctx) => {
    await ctx.db.insert("userPreferences", {
      userId: optedOut,
      weeklyDigest: false,
      updatedAt: NOW,
    });
    const announce = (
      title: string,
      audience: { kind: "all" } | { kind: "department"; department: string },
      publishedAt: number,
    ) =>
      ctx.db.insert("announcements", {
        title,
        body: "",
        authorUserId: sales,
        pinned: false,
        audience,
        attachmentStorageIds: [],
        publishedAt,
        createdAt: publishedAt,
      });
    await announce("Sommerfest", { kind: "all" }, NOW - 2 * DAY);
    await announce("Sales-Kickoff", { kind: "department", department: "Sales" }, NOW - 3 * DAY);
    await announce("Alte Nachricht", { kind: "all" }, NOW - 10 * DAY);
    await ctx.db.insert("events", {
      title: "Teammeeting",
      start: NOW + 2 * DAY,
      end: NOW + 2 * DAY + 3600_000,
      allDay: false,
      createdByUserId: sales,
      audience: { kind: "all" },
      createdAt: NOW,
    });
    await ctx.db.insert("wikiEntries", {
      slug: "datenschutz",
      thema: "Datenschutz",
      erklaerung: "",
      tags: [],
      policy: true,
      policyVersion: 1,
      validFrom: NOW - 30 * DAY,
      validUntil: NOW + 300 * DAY,
      version: 1,
      pinned: false,
      authorUserId: sales,
      authorName: "Sales",
      createdAt: NOW - 30 * DAY,
      updatedAt: NOW - 30 * DAY,
    });
    await ctx.db.insert("guidebookReads", {
      userId: care,
      slug: "datenschutz",
      readAt: NOW,
      version: 1,
    });
  });
  return t;
}

describe("weekly digest", () => {
  test("each person gets what's meant for them from the last seven days", async () => {
    const t = await setup();
    const digests = await t.query(internal.digest.weekly.build, { until: NOW });
    const byEmail = new Map(digests.map((d) => [d.email, d]));

    expect(byEmail.get("sales@advantisgroup.de")?.announcements.map((a) => a.title)).toEqual([
      "Sommerfest",
      "Sales-Kickoff",
    ]);
    expect(byEmail.get("care@advantisgroup.de")?.announcements.map((a) => a.title)).toEqual([
      "Sommerfest",
    ]);
    expect(byEmail.get("sales@advantisgroup.de")?.policies.map((p) => p.title)).toEqual([
      "Datenschutz",
    ]);
    expect(byEmail.get("care@advantisgroup.de")?.policies).toEqual([]);
    expect(byEmail.get("care@advantisgroup.de")?.events.map((e) => e.path)).toHaveLength(1);
  });

  test("leaves out people who opted out and externals who never opted in", async () => {
    const t = await setup();
    const emails = (await t.query(internal.digest.weekly.build, { until: NOW })).map(
      (d) => d.email,
    );
    expect(emails).not.toContain("optedout@advantisgroup.de");
    expect(emails).not.toContain("external@advantisgroup.de");
  });

  test("sends nothing in a quiet week", async () => {
    const t = await setup();
    const digests = await t.query(internal.digest.weekly.build, { until: NOW + 60 * DAY });
    // Only the unconfirmed policy is still news for the sales colleague.
    expect(digests.map((d) => d.email)).toEqual(["sales@advantisgroup.de"]);
  });

  test("leaves managers-only wiki pages and policies out for employees", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const author = (await ctx.db.query("users").first())!._id;
      for (const [slug, policy] of [
        ["fuehrung-neu", false],
        ["fuehrung-richtlinie", true],
      ] as const) {
        await ctx.db.insert("wikiEntries", {
          slug,
          thema: slug,
          erklaerung: "",
          tags: [],
          minRole: "manager",
          policy: policy || undefined,
          policyVersion: policy ? 1 : undefined,
          validFrom: NOW - DAY,
          validUntil: NOW + 300 * DAY,
          version: 1,
          pinned: false,
          authorUserId: author,
          authorName: "x",
          createdAt: NOW - DAY,
          updatedAt: NOW - DAY,
        });
      }
    });
    const digests = await t.query(internal.digest.weekly.build, { until: NOW });
    const sales = digests.find((d) => d.email === "sales@advantisgroup.de")!;
    expect(sales.wiki).toEqual([]);
    expect(sales.policies.map((p) => p.title)).toEqual(["Datenschutz"]);
  });
});
