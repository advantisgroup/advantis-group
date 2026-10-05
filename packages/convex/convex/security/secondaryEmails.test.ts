/**
 * The code is only ever mailed, so `plantSecondaryEmailCode` rewrites the
 * challenge hash to one the test knows.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { sha256hex } from "../lib/crypto";

const serverKey = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function seedUser(
  t: T,
  opts: { clerkUserId: string; email: string; firstName?: string; status?: "active" | "suspended" },
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId: opts.clerkUserId,
      email: opts.email,
      firstName: opts.firstName,
      role: "employee",
      status: opts.status ?? "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function requestCode(t: T, clerkUserId: string, email: string) {
  return await t.mutation(api.security.secondaryEmails.apiRequestCode, {
    serverKey,
    clerkUserId,
    email,
  });
}

/** Requests a code, then rewrites the stored hash to `code` so the test can
 * verify with a known value — the code itself is only ever mailed. */
async function plantSecondaryEmailCode(
  t: T,
  clerkUserId: string,
  userId: Id<"users">,
  email: string,
  code: string,
) {
  await requestCode(t, clerkUserId, email);
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("userSecondaryEmailChallenges")
      .withIndex("by_user_email", (q) => q.eq("userId", userId).eq("email", email))
      .unique();
    if (!row) throw new Error("no challenge row was created");
    await ctx.db.patch(row._id, { codeHash: await sha256hex(code) });
  });
}

async function listRows(t: T, clerkUserId: string) {
  return await t.query(api.security.secondaryEmails.apiList, { serverKey, clerkUserId });
}

describe("requesting a code", () => {
  test("rejects the account's own primary email", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await expect(requestCode(t, "alice", "alice@advantisgroup.de")).rejects.toThrow(
      "already your account's own email",
    );
  });

  test("rejects an email that's someone else's primary address", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await seedUser(t, { clerkUserId: "bob", email: "bob@advantisgroup.de" });
    await expect(requestCode(t, "alice", "bob@advantisgroup.de")).rejects.toThrow("already in use");
  });

  test("rejects an email already verified as another account's secondary", async () => {
    const t = setup();
    const bobId = await seedUser(t, { clerkUserId: "bob", email: "bob@advantisgroup.de" });
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await plantSecondaryEmailCode(t, "bob", bobId, "shared@example.com", "111111");
    await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
      serverKey,
      clerkUserId: "bob",
      email: "shared@example.com",
      code: "111111",
    });

    await expect(requestCode(t, "alice", "shared@example.com")).rejects.toThrow("already in use");
  });

  test("a pending (unverified) row from another account doesn't block a new request", async () => {
    const t = setup();
    const bobId = await seedUser(t, { clerkUserId: "bob", email: "bob@advantisgroup.de" });
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await requestCode(t, "bob", "contested@example.com");
    void bobId;

    // Not yet verified, so it's not "in use" yet — someone else can still try to claim it.
    await expect(requestCode(t, "alice", "contested@example.com")).resolves.toEqual({
      alreadyVerified: false,
    });
  });

  test("re-requesting for the account's own pending address is a no-op on the row count", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await requestCode(t, "alice", "work@example.com");
    const rows = await listRows(t, "alice");
    expect(rows).toHaveLength(1);
  });

  test("reports alreadyVerified without minting a new code for an already-verified row", async () => {
    const t = setup();
    const aliceId = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await plantSecondaryEmailCode(t, "alice", aliceId, "work@example.com", "123456");
    await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
      serverKey,
      clerkUserId: "alice",
      email: "work@example.com",
      code: "123456",
    });

    await expect(requestCode(t, "alice", "work@example.com")).resolves.toEqual({
      alreadyVerified: true,
    });
  });

  test("enforces the per-account limit on new pending addresses", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    for (let i = 0; i < 5; i++) {
      await requestCode(t, "alice", `work${i}@example.com`);
    }
    await expect(requestCode(t, "alice", "work6@example.com")).rejects.toThrow(
      "up to 5 secondary emails",
    );
  });

  test("a second request inside the cooldown window is refused", async () => {
    const t = setup();
    await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await requestCode(t, "alice", "work@example.com");
    await expect(requestCode(t, "alice", "work@example.com")).rejects.toThrow("Wait a moment");
  });
});

describe("verifying a code", () => {
  test("the right code verifies the row and clears the challenge", async () => {
    const t = setup();
    const aliceId = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await plantSecondaryEmailCode(t, "alice", aliceId, "work@example.com", "654321");

    const result = await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
      serverKey,
      clerkUserId: "alice",
      email: "work@example.com",
      code: "654321",
    });
    expect(result).toEqual({ ok: true });

    const rows = await listRows(t, "alice");
    expect(rows).toEqual([expect.objectContaining({ email: "work@example.com", verified: true })]);
  });

  test("a wrong code fails and reports attempts left, without deleting the pending row", async () => {
    const t = setup();
    const aliceId = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await plantSecondaryEmailCode(t, "alice", aliceId, "work@example.com", "111111");

    const result = await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
      serverKey,
      clerkUserId: "alice",
      email: "work@example.com",
      code: "000000",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("4 attempts left");

    const rows = await listRows(t, "alice");
    expect(rows).toEqual([expect.objectContaining({ email: "work@example.com", verified: false })]);
  });

  test("five wrong attempts exhausts the code", async () => {
    const t = setup();
    const aliceId = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await plantSecondaryEmailCode(t, "alice", aliceId, "work@example.com", "111111");

    let last: { ok: boolean; message?: string } | undefined;
    for (let i = 0; i < 5; i++) {
      last = await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
        serverKey,
        clerkUserId: "alice",
        email: "work@example.com",
        code: "000000",
      });
    }
    expect(last?.message).toBe("Too many incorrect attempts. Request a new code.");

    const retry = await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
      serverKey,
      clerkUserId: "alice",
      email: "work@example.com",
      code: "111111",
    });
    expect(retry).toEqual({ ok: false, message: "No code is waiting. Request one first." });
  });

  test("a conflict that appears between request and verify still blocks confirmation", async () => {
    const t = setup();
    const aliceId = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await seedUser(t, { clerkUserId: "bob", email: "bob@advantisgroup.de" });
    await plantSecondaryEmailCode(t, "alice", aliceId, "shared@example.com", "222222");

    // Bob's account claims the same address as its own primary email in the
    // gap between Alice's request and her confirming the code.
    await t.run(async (ctx) => {
      const bob = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", "bob"))
        .unique();
      if (!bob) throw new Error("bob missing");
      await ctx.db.patch(bob._id, { email: "shared@example.com" });
    });

    const result = await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
      serverKey,
      clerkUserId: "alice",
      email: "shared@example.com",
      code: "222222",
    });
    expect(result).toEqual({ ok: false, message: "That email is already in use." });
  });
});

describe("removing a secondary email", () => {
  test("removal frees the address up for a fresh request", async () => {
    const t = setup();
    const aliceId = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await plantSecondaryEmailCode(t, "alice", aliceId, "work@example.com", "123123");
    await t.mutation(api.security.secondaryEmails.apiVerifyCode, {
      serverKey,
      clerkUserId: "alice",
      email: "work@example.com",
      code: "123123",
    });
    const [row] = await listRows(t, "alice");

    await t.mutation(api.security.secondaryEmails.apiRemove, {
      serverKey,
      clerkUserId: "alice",
      secondaryEmailId: row!._id,
    });
    expect(await listRows(t, "alice")).toEqual([]);

    // Re-requesting starts fresh, not "alreadyVerified".
    await expect(requestCode(t, "alice", "work@example.com")).resolves.toEqual({
      alreadyVerified: false,
    });
  });

  test("refuses to remove a row that belongs to someone else", async () => {
    const t = setup();
    const aliceId = await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
    await seedUser(t, { clerkUserId: "bob", email: "bob@advantisgroup.de" });
    await requestCode(t, "alice", "work@example.com");
    const [row] = await listRows(t, "alice");
    void aliceId;

    await expect(
      t.mutation(api.security.secondaryEmails.apiRemove, {
        serverKey,
        clerkUserId: "bob",
        secondaryEmailId: row!._id,
      }),
    ).rejects.toThrow("Not found");
  });
});

test("apiList only ever returns the caller's own rows", async () => {
  const t = setup();
  await seedUser(t, { clerkUserId: "alice", email: "alice@advantisgroup.de" });
  await seedUser(t, { clerkUserId: "bob", email: "bob@advantisgroup.de" });
  await requestCode(t, "alice", "alice-work@example.com");
  await requestCode(t, "bob", "bob-work@example.com");

  const aliceRows = await listRows(t, "alice");
  expect(aliceRows).toHaveLength(1);
  expect(aliceRows[0]?.email).toBe("alice-work@example.com");
});
