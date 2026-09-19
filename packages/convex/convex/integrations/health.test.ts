import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

test("admins hear about a failing webhook once, not on every failure", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId: "admin",
      email: "admin@advantisgroup.de",
      role: "admin",
      status: "active",
      createdAt: 0,
    });
  });
  const record = (ok: boolean) =>
    t.mutation(api.integrations.health.apiRecordWebhook, {
      serverKey,
      source: "resend",
      ok,
      message: ok ? undefined : "bad signature",
    });
  const alerts = () =>
    t.run((ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("type"), "system_alert"))
        .collect(),
    );

  await record(true);
  await record(false);
  await record(false);
  expect(await alerts()).toHaveLength(1);

  await record(true);
  await record(false);
  expect(await alerts()).toHaveLength(2);
});
