import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { sha256hex } from "../activity/lib/crypto";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";
const email = "person@example.com";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function startCode(t: T, action: "subscribe" | "unsubscribe", code = "123456") {
  return await t.mutation(api.marketing.emails.startNotifyCode, {
    serverKey,
    email,
    action,
    codeHash: await sha256hex(code),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
}

async function redeem(t: T, action: "subscribe" | "unsubscribe", code: string) {
  return await t.mutation(api.marketing.emails.redeemNotifyCode, {
    serverKey,
    email,
    action,
    codeHash: await sha256hex(code),
  });
}

const subscribed = (t: T) =>
  t.run(async (ctx) =>
    ctx.db
      .query("notifyEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first(),
  );

describe("server key", () => {
  test("submission history can't be read without it", async () => {
    const t = setup();
    await expect(
      t.query(api.marketing.inquiries.listForAccount, {
        serverKey: "wrong",
        account: { clerkUserId: "user_1", emails: [email] },
      }),
    ).rejects.toThrow(/server key/i);
  });

  test("the notify list can't be edited without it", async () => {
    const t = setup();
    await expect(
      t.mutation(api.marketing.emails.deleteNotifyEmail, { serverKey: "wrong", email }),
    ).rejects.toThrow(/server key/i);
  });
});

describe("notify codes", () => {
  test("the right code subscribes, once", async () => {
    const t = setup();
    await startCode(t, "subscribe");

    expect(await redeem(t, "subscribe", "123456")).toEqual({ status: "subscribed" });
    expect(await subscribed(t)).not.toBeNull();
    // used up
    expect(await redeem(t, "subscribe", "123456")).toEqual({ status: "invalid" });
  });

  test("a subscribe code can't be used to unsubscribe", async () => {
    const t = setup();
    await startCode(t, "subscribe");
    expect(await redeem(t, "unsubscribe", "123456")).toEqual({ status: "invalid" });
  });

  test("wrong guesses lock the code", async () => {
    const t = setup();
    await startCode(t, "subscribe");

    for (let i = 0; i < 4; i++) {
      expect(await redeem(t, "subscribe", "000000")).toEqual({ status: "invalid" });
    }
    expect(await redeem(t, "subscribe", "000000")).toEqual({ status: "locked" });
    // even the right one is dead now
    expect(await redeem(t, "subscribe", "123456")).toEqual({ status: "locked" });
    expect(await subscribed(t)).toBeNull();
  });

  test("an expired code is refused", async () => {
    const t = setup();
    await t.mutation(api.marketing.emails.startNotifyCode, {
      serverKey,
      email,
      action: "subscribe",
      codeHash: await sha256hex("123456"),
      expiresAt: Date.now() - 1,
    });
    expect(await redeem(t, "subscribe", "123456")).toEqual({ status: "expired" });
  });

  test("a second request right away keeps the first code", async () => {
    const t = setup();
    expect(await startCode(t, "subscribe", "111111")).toEqual({ throttled: false });
    expect(await startCode(t, "subscribe", "222222")).toEqual({ throttled: true });
    expect(await redeem(t, "subscribe", "111111")).toEqual({ status: "subscribed" });
  });

  test("unsubscribing answers the same whether or not the address was listed", async () => {
    const t = setup();
    await startCode(t, "unsubscribe");
    expect(await redeem(t, "unsubscribe", "123456")).toEqual({ status: "unsubscribed" });

    await t.run(async (ctx) => ctx.db.insert("notifyEmails", { email, createdAt: Date.now() }));
    await t.run(async (ctx) => {
      const row = await ctx.db.query("notifyCodes").first();
      if (row) await ctx.db.delete(row._id);
    });
    await startCode(t, "unsubscribe");
    expect(await redeem(t, "unsubscribe", "123456")).toEqual({ status: "unsubscribed" });
    expect(await subscribed(t)).toBeNull();
  });
});
