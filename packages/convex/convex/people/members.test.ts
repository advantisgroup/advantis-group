import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const SERVER_KEY = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function seedUser(
  t: T,
  clerkUserId: string,
  role: "admin" | "manager" | "employee" = "employee",
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      firstName: clerkUserId,
      role,
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedPresence(t: T, userId: Id<"users">) {
  await t.run((ctx) => ctx.db.insert("presence", { userId, lastActiveAt: Date.now() }));
}

async function invite(t: T, email: string, invitedByUserId: Id<"users">) {
  await t.run(async (ctx) =>
    ctx.db.insert("invites", {
      email,
      role: "manager",
      invitedByUserId,
      token: "token",
      status: "pending",
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    }),
  );
}

describe("removing a member", () => {
  test("keeps the row, marks it removed and hides it from the directory", async () => {
    const t = setup();
    const adminId = await seedUser(t, "admin", "admin");
    const bobId = await seedUser(t, "bob");
    await seedPresence(t, bobId);

    await t
      .withIdentity({ subject: "admin" })
      .mutation(api.people.members.remove, { userId: bobId });

    const bob = await t.run((ctx) => ctx.db.get(bobId));
    expect(bob?.status).toBe("removed");
    expect(bob?.removedBy).toBe(adminId);
    expect(bob?.firstName).toBe("bob");

    const presence = await t.run((ctx) => ctx.db.query("presence").collect());
    expect(presence).toHaveLength(0);

    const directory = await t
      .withIdentity({ subject: "admin" })
      .query(api.people.users.list, { includeSuspended: true });
    expect(directory.map((u) => u._id)).toEqual([adminId]);
  });

  test("a removed member's leftover session is refused", async () => {
    const t = setup();
    await seedUser(t, "admin", "admin");
    const bobId = await seedUser(t, "bob");
    await t
      .withIdentity({ subject: "admin" })
      .mutation(api.people.members.remove, { userId: bobId });

    await expect(
      t.withIdentity({ subject: "bob" }).query(api.people.users.list, {}),
    ).rejects.toThrow();

    const result = await t
      .withIdentity({ subject: "bob", email: "bob@advantisgroup.de" })
      .mutation(api.people.users.ensureCurrentUser, {});
    expect(result.status).toBe("needs_request");
  });

  test("the Clerk webhook's delete marks the row removed instead of deleting it", async () => {
    const t = setup();
    const bobId = await seedUser(t, "bob");

    await t.mutation(api.people.clerkSync.deactivateFromClerk, {
      serverKey: SERVER_KEY,
      clerkUserId: "bob",
    });

    expect((await t.run((ctx) => ctx.db.get(bobId)))?.status).toBe("removed");
  });

  test("a new invite brings the old row back under the new Clerk id", async () => {
    const t = setup();
    const adminId = await seedUser(t, "admin", "admin");
    const bobId = await seedUser(t, "bob");
    await t
      .withIdentity({ subject: "admin" })
      .mutation(api.people.members.remove, { userId: bobId });
    await invite(t, "bob@advantisgroup.de", adminId);

    const result = await t
      .withIdentity({ subject: "bob-new", email: "bob@advantisgroup.de" })
      .mutation(api.people.users.ensureCurrentUser, {});

    expect(result).toMatchObject({ status: "active", userId: bobId, role: "manager" });
    const bob = await t.run((ctx) => ctx.db.get(bobId));
    expect(bob).toMatchObject({ clerkUserId: "bob-new", status: "active", firstName: "bob" });
    expect(bob?.removedAt).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(2);
  });
});

describe("signing in under a new Clerk id", () => {
  test("relinks the existing row by verified email", async () => {
    const t = setup();
    const bobId = await seedUser(t, "bob-old-instance");

    const result = await t
      .withIdentity({ subject: "bob-shared", email: "bob-old-instance@advantisgroup.de" })
      .mutation(api.people.users.ensureCurrentUser, {});

    expect(result).toMatchObject({ status: "active", userId: bobId });
    expect((await t.run((ctx) => ctx.db.get(bobId)))?.clerkUserId).toBe("bob-shared");
  });
});

describe("accepting an invite", () => {
  test("takes the name the inviter typed when Clerk has none", async () => {
    const t = setup();
    const adminId = await seedUser(t, "admin", "admin");
    await t.run(async (ctx) =>
      ctx.db.insert("invites", {
        email: "dohlen@advantisgroup.de",
        role: "employee",
        invitedByUserId: adminId,
        token: "token",
        status: "pending",
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
        firstName: "Dalia",
        lastName: "Dohlen",
      }),
    );

    const result = await t
      .withIdentity({ subject: "dalia", email: "dohlen@advantisgroup.de" })
      .mutation(api.people.users.ensureCurrentUser, {});

    expect(result.status).toBe("active");
    const user = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", "dalia"))
        .unique(),
    );
    expect(user).toMatchObject({ firstName: "Dalia", lastName: "Dohlen", role: "employee" });
  });
});

describe("team tags on the profile", () => {
  test("ticking a team also adds the membership; unticking removes it", async () => {
    const t = setup();
    const adminId = await seedUser(t, "admin", "admin");
    const bobId = await seedUser(t, "bob");
    const teamId = await t.run((ctx) =>
      ctx.db.insert("teams", {
        name: "Sales",
        slug: "customer-care",
        createdAt: Date.now(),
        createdBy: adminId,
      }),
    );
    const admin = t.withIdentity({ subject: "admin" });
    const memberships = () =>
      t.run((ctx) =>
        ctx.db
          .query("userTeams")
          .withIndex("by_user", (q) => q.eq("userId", bobId))
          .collect(),
      );

    await admin.mutation(api.people.users.setTeams, { userId: bobId, teams: ["customer-care"] });
    expect((await memberships()).map((m) => m.teamId)).toEqual([teamId]);

    await admin.mutation(api.people.users.setTeams, { userId: bobId, teams: [] });
    expect(await memberships()).toEqual([]);
  });
});
