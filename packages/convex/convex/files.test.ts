import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const clerkUserId of ["alice", "bob"]) {
      await ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        role: "employee",
        status: "active",
        createdAt: 0,
      });
    }
  });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["hello"])));
  return {
    t,
    storageId,
    alice: t.withIdentity({ subject: "alice" }),
    bob: t.withIdentity({ subject: "bob" }),
  };
}

describe("rolling back uploads", () => {
  test("whoever claimed an upload can delete it", async () => {
    const { t, storageId, alice } = await setup();
    await alice.mutation(api.files.claimUpload, { storageId });
    expect(await alice.mutation(api.files.deleteFile, { storageId })).toEqual({ deleted: true });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
  });

  test("nobody else can, and a second claim doesn't take it over", async () => {
    const { storageId, alice, bob } = await setup();
    await alice.mutation(api.files.claimUpload, { storageId });
    expect(await bob.mutation(api.files.claimUpload, { storageId })).toEqual({ claimed: false });
    await expect(bob.mutation(api.files.deleteFile, { storageId })).rejects.toThrow(
      "This file can't be deleted here",
    );
  });

  test("an unclaimed file can't be deleted by anyone", async () => {
    const { storageId, alice } = await setup();
    await expect(alice.mutation(api.files.deleteFile, { storageId })).rejects.toThrow(
      "This file can't be deleted here",
    );
  });
});
