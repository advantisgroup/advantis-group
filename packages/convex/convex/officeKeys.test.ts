/** Schlüssel: admins only, hand-overs logged, former staff flagged. */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkUserId: string, role: "admin" | "employee", status = "active" as const) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId,
        role,
        status,
        external: false,
        createdAt: Date.now(),
      });
    await user("admin", "admin");
    return { anna: await user("anna", "employee") };
  });
  return { t, admin: t.withIdentity({ subject: "admin" }), ...ids };
}

describe("office keys", () => {
  test("employees can neither list nor change keys", async () => {
    const { t } = await setup();
    const anna = t.withIdentity({ subject: "anna" });
    await expect(anna.query(api.officeKeys.list, {})).rejects.toThrow();
    await expect(anna.mutation(api.officeKeys.create, { label: "Haupteingang" })).rejects.toThrow();
  });

  test("issue, hand over and return are all in the history", async () => {
    const { t, admin, anna } = await setup();
    const keyId = await admin.mutation(api.officeKeys.create, {
      label: " Haupteingang ",
      number: "HE-1",
      holderUserId: anna,
    });
    let [key] = await admin.query(api.officeKeys.list, {});
    expect(key).toMatchObject({ label: "Haupteingang", holderName: "anna", holderGone: false });

    await admin.mutation(api.officeKeys.setHolder, { keyId, holderUserId: null });
    [key] = await admin.query(api.officeKeys.list, {});
    expect(key).toMatchObject({ holderUserId: null, issuedAt: null });

    const history = await admin.query(api.officeKeys.history, { keyId });
    expect(history.map((row) => row.action)).toEqual(["returned", "issued", "created"]);
    void t;
  });

  test("a key held by someone who left is flagged", async () => {
    const { t, admin, anna } = await setup();
    await admin.mutation(api.officeKeys.create, { label: "Keller", holderUserId: anna });
    await t.run((ctx) => ctx.db.patch(anna, { status: "removed" }));
    const [key] = await admin.query(api.officeKeys.list, {});
    expect(key.holderGone).toBe(true);
  });

  test("delete moves the key to the trash", async () => {
    const { t, admin } = await setup();
    const keyId = await admin.mutation(api.officeKeys.create, { label: "Briefkasten" });
    await admin.mutation(api.officeKeys.remove, { keyId });
    expect(await admin.query(api.officeKeys.list, {})).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(keyId)))?.deletedAt).toBeDefined();
  });
});
