import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

async function setup(status: "active" | "suspended" | "removed" = "active") {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "clerk_bob",
      email: "bob@advantisgroup.de",
      firstName: "Bob",
      role: "employee",
      status,
      createdAt: 0,
    }),
  );
  const bob = () => t.run((ctx) => ctx.db.get(userId));
  const sync = (args: { updatedAt?: number; firstName?: string; banned?: boolean }) =>
    t.mutation(api.people.clerkSync.syncFromClerk, {
      serverKey,
      clerkUserId: "clerk_bob",
      ...args,
    });
  return { t, bob, sync };
}

describe("syncFromClerk", () => {
  test("applies a newer event", async () => {
    const { bob, sync } = await setup();
    expect(await sync({ updatedAt: 2, firstName: "Robert" })).toEqual({ synced: true });
    expect((await bob())?.firstName).toBe("Robert");
    expect((await bob())?.clerkUpdatedAt).toBe(2);
  });

  test("ignores an event older than the last one applied", async () => {
    const { bob, sync } = await setup();
    await sync({ updatedAt: 5, firstName: "Robert" });
    expect(await sync({ updatedAt: 3, firstName: "Bobby" })).toEqual({ synced: false });
    expect((await bob())?.firstName).toBe("Robert");
  });

  test("a Clerk ban suspends, and lifting it doesn't reactivate", async () => {
    const { bob, sync } = await setup();
    await sync({ updatedAt: 1, banned: true });
    expect((await bob())?.status).toBe("suspended");
    await sync({ updatedAt: 2, banned: false });
    expect((await bob())?.status).toBe("suspended");
  });

  test("never touches a removed member", async () => {
    const { bob, sync } = await setup("removed");
    expect(await sync({ updatedAt: 1, firstName: "Robert" })).toEqual({ synced: false });
    expect((await bob())?.firstName).toBe("Bob");
  });

  test("an unknown Clerk id is a no-op", async () => {
    const { t } = await setup();
    const result = await t.mutation(api.people.clerkSync.syncFromClerk, {
      serverKey,
      clerkUserId: "nobody",
      firstName: "X",
    });
    expect(result).toEqual({ synced: false });
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });

  test("rejects a wrong server key", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(api.people.clerkSync.syncFromClerk, {
        serverKey: "nope",
        clerkUserId: "clerk_bob",
      }),
    ).rejects.toThrow("Invalid server key");
  });
});

describe("intranet → Clerk", () => {
  test("suspending schedules a Clerk lock instead of calling Clerk inline", async () => {
    const { t } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "clerk_admin",
        email: "admin@advantisgroup.de",
        role: "admin",
        status: "active",
        createdAt: 0,
      }),
    );
    const bobId = (await t.run((ctx) => ctx.db.query("users").first()))!._id;
    await t
      .withIdentity({ subject: "clerk_admin" })
      .mutation(api.people.users.setStatus, { userId: bobId, status: "suspended" });

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].name).toContain("clerkSync");
    expect(scheduled[0].args[0]).toMatchObject({
      change: { kind: "lock", clerkUserId: "clerk_bob" },
      attempt: 0,
    });
  });
});
