/** Zugänge: admins only, ciphertext never in the list, every reveal logged. */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const [clerkUserId, role] of [
      ["admin", "admin"],
      ["anna", "employee"],
    ] as const) {
      await ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      });
    }
  });
  return t;
}

const entry = {
  title: " Microsoft 365 Admin ",
  category: "microsoft" as const,
  username: "admin@advantisgroup.de",
  passwordEnc: "iv.tag.cipher",
};

describe("vault entries", () => {
  test("only admins can create, list or reveal", async () => {
    const t = await setup();
    await expect(
      t.mutation(api.vault.entries.apiCreate, { serverKey, clerkUserId: "anna", ...entry }),
    ).rejects.toThrow();
    const id = await t.mutation(api.vault.entries.apiCreate, {
      serverKey,
      clerkUserId: "admin",
      ...entry,
    });
    await expect(
      t.withIdentity({ subject: "anna" }).query(api.vault.entries.list, {}),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.vault.entries.apiReveal, { serverKey, clerkUserId: "anna", entryId: id }),
    ).rejects.toThrow();

    const list = await t.withIdentity({ subject: "admin" }).query(api.vault.entries.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Microsoft 365 Admin", hasNotes: false });
    expect(JSON.stringify(list)).not.toContain("cipher");
  });

  test("reveal hands back the ciphertext and lands in the history", async () => {
    const t = await setup();
    const id = await t.mutation(api.vault.entries.apiCreate, {
      serverKey,
      clerkUserId: "admin",
      ...entry,
    });
    const sealed = await t.mutation(api.vault.entries.apiReveal, {
      serverKey,
      clerkUserId: "admin",
      entryId: id,
    });
    expect(sealed).toEqual({ passwordEnc: "iv.tag.cipher", notesEnc: null });

    const history = await t
      .withIdentity({ subject: "admin" })
      .query(api.vault.entries.history, { entryId: id });
    expect(history.map((row) => row.action)).toEqual(["revealed", "created"]);
  });

  test("an update without a password keeps it, an empty note clears the notes", async () => {
    const t = await setup();
    const id = await t.mutation(api.vault.entries.apiCreate, {
      serverKey,
      clerkUserId: "admin",
      ...entry,
      notesEnc: "iv.tag.notes",
    });
    await t.mutation(api.vault.entries.apiUpdate, {
      serverKey,
      clerkUserId: "admin",
      entryId: id,
      title: "M365",
      category: "microsoft",
      notesEnc: "",
    });
    const stored = await t.run((ctx) => ctx.db.get(id));
    expect(stored).toMatchObject({ title: "M365", passwordEnc: "iv.tag.cipher" });
    expect(stored?.notesEnc).toBeUndefined();
  });

  test("delete moves the entry to the trash", async () => {
    const t = await setup();
    const id = await t.mutation(api.vault.entries.apiCreate, {
      serverKey,
      clerkUserId: "admin",
      ...entry,
    });
    await t.withIdentity({ subject: "admin" }).mutation(api.vault.entries.remove, { entryId: id });
    expect(await t.withIdentity({ subject: "admin" }).query(api.vault.entries.list, {})).toEqual(
      [],
    );
    const stored = await t.run((ctx) => ctx.db.get(id));
    expect(stored?.deletedAt).toBeDefined();
  });
});
