/**
 * Push subscriptions: one row per browser, handed to whoever signs in on it,
 * and a notification is only pushed to people who switched browser
 * notifications on.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = [];
  for (const clerkUserId of ["alice", "bob"]) {
    ids.push(
      await t.run((ctx) =>
        ctx.db.insert("users", {
          clerkUserId,
          email: `${clerkUserId}@advantisgroup.de`,
          role: "employee",
          status: "active",
          external: false,
          createdAt: Date.now(),
        }),
      ),
    );
  }
  return { t, alice: ids[0], bob: ids[1] };
}

const browser = { endpoint: "https://push.example/abc", p256dh: "p", auth: "a" };

describe("push subscriptions", () => {
  test("a browser belongs to whoever subscribed it last", async () => {
    const { t, bob } = await setup();
    await t.withIdentity({ subject: "alice" }).mutation(api.notifications.push.subscribe, browser);
    await t.withIdentity({ subject: "bob" }).mutation(api.notifications.push.subscribe, browser);
    const rows = await t.run((ctx) => ctx.db.query("pushSubscriptions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(bob);
  });

  test("only pushes for people who turned browser notifications on", async () => {
    const { t, alice } = await setup();
    await t.withIdentity({ subject: "alice" }).mutation(api.notifications.push.subscribe, browser);
    const notificationId = await t.run((ctx) =>
      ctx.db.insert("notifications", {
        userId: alice,
        type: "chat_message",
        title: "Neue Nachricht",
        link: "/chat",
        createdAt: Date.now(),
      }),
    );
    expect(await t.query(internal.notifications.push.target, { notificationId })).toBeNull();

    await t.run((ctx) =>
      ctx.db.insert("userPreferences", { userId: alice, browserPushEnabled: true, updatedAt: 0 }),
    );
    expect(await t.query(internal.notifications.push.target, { notificationId })).toMatchObject({
      notification: { title: "Neue Nachricht", link: "/chat" },
      subscriptions: [browser],
    });
  });

  test("forgets endpoints the push service says are gone", async () => {
    const { t } = await setup();
    await t.withIdentity({ subject: "alice" }).mutation(api.notifications.push.subscribe, browser);
    await t.mutation(internal.notifications.push.removeEndpoints, {
      endpoints: [browser.endpoint],
    });
    expect(await t.run((ctx) => ctx.db.query("pushSubscriptions").collect())).toEqual([]);
  });
});
