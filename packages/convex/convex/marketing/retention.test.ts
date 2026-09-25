import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

const lead = (t: T, fields: Record<string, unknown>) =>
  t.run((ctx) =>
    ctx.db.insert("whitepaperLeads", {
      email: "lead@example.com",
      company: "Acme",
      firstName: "Max",
      lastName: "Mustermann",
      phone: "123",
      locale: "de",
      status: "pending",
      requestedAt: Date.now(),
      consentVersion: "v1",
      ...fields,
    }),
  );

describe("purgeLeads", () => {
  test("deletes unconfirmed requests after 30 days and keeps fresh ones", async () => {
    const t = setup();
    const stale = await lead(t, { requestedAt: Date.now() - 31 * DAY });
    const fresh = await lead(t, { requestedAt: Date.now() - 2 * DAY });

    await t.mutation(internal.marketing.retention.purgeLeads, {});

    expect(await t.run((ctx) => ctx.db.get(stale))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(fresh))).not.toBeNull();
  });

  test("keeps confirmed consent, and withdrawn consent until its proof period ends", async () => {
    const t = setup();
    const old = Date.now() - 10 * YEAR;
    const active = await lead(t, { status: "confirmed", requestedAt: old, confirmedAt: old });
    const recentlyWithdrawn = await lead(t, {
      status: "confirmed",
      requestedAt: old,
      withdrawnAt: Date.now() - YEAR,
    });
    const longWithdrawn = await lead(t, {
      status: "confirmed",
      requestedAt: old,
      withdrawnAt: Date.now() - 4 * YEAR,
    });

    await t.mutation(internal.marketing.retention.purgeLeads, {});

    expect(await t.run((ctx) => ctx.db.get(active))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(recentlyWithdrawn))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(longWithdrawn))).toBeNull();
  });
});

describe("purgeAnalytics", () => {
  test("leaves statistics younger than the retention period alone", async () => {
    const t = setup();
    const view = await t.run((ctx) =>
      ctx.db.insert("analyticsPageviews", {
        path: "/de",
        locale: "de",
        sessionId: "s",
        createdAt: Date.now(),
      }),
    );

    const result = await t.mutation(internal.marketing.retention.purgeAnalytics, {});

    expect(result.deleted).toBe(0);
    expect(await t.run((ctx) => ctx.db.get(view))).not.toBeNull();
  });
});
