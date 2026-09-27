/**
 * "Who to ask": everyone reads it, only admins change it, and people who have
 * left drop out of it on their own.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const user = (clerkUserId: string, role: "employee" | "admin", status = "active" as const) =>
    t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId,
        role,
        status,
        external: false,
        createdAt: Date.now(),
      }),
    );
  const admin = await user("admin", "admin");
  const it = await user("it", "employee");
  const left = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "left",
      email: "left@advantisgroup.de",
      role: "employee",
      status: "removed",
      external: false,
      createdAt: Date.now(),
    }),
  );
  await user("employee", "employee");
  return { t, admin, it, left };
}

describe("who to ask", () => {
  test("admins add contacts, everyone reads them, people who left drop out", async () => {
    const { t, it, left } = await setup();
    await t.withIdentity({ subject: "admin" }).mutation(api.org.contacts.create, {
      section: "help",
      topic: "IT & Zugänge",
      note: "Für alles, was nicht startet",
      userIds: [it, left, it],
    });
    await t.withIdentity({ subject: "admin" }).mutation(api.org.contacts.create, {
      section: "safety",
      topic: "Notruf",
      userIds: [],
      phone: "112",
    });
    const rows = await t.withIdentity({ subject: "employee" }).query(api.org.contacts.list, {});
    expect(rows.map((r) => [r.topic, r.people.map((p) => p.name), r.phone])).toEqual([
      ["IT & Zugänge", ["it"], null],
      ["Notruf", [], "112"],
    ]);
  });

  test("employees can't change the list", async () => {
    const { t, it } = await setup();
    await expect(
      t.withIdentity({ subject: "employee" }).mutation(api.org.contacts.create, {
        section: "help",
        topic: "IT",
        userIds: [it],
      }),
    ).rejects.toThrow();
  });

  test("an entry needs someone to ask or a way to reach them", async () => {
    const { t } = await setup();
    await expect(
      t.withIdentity({ subject: "admin" }).mutation(api.org.contacts.create, {
        section: "help",
        topic: "Lohn",
        userIds: [],
      }),
    ).rejects.toThrow("Add at least one person, a phone number or an email");
  });

  test("clearing a field in an edit removes it", async () => {
    const { t, it } = await setup();
    const admin = t.withIdentity({ subject: "admin" });
    const id = await admin.mutation(api.org.contacts.create, {
      section: "help",
      topic: "IT",
      note: "Alt",
      userIds: [it],
    });
    await admin.mutation(api.org.contacts.update, {
      id,
      section: "help",
      topic: "IT",
      userIds: [it],
    });
    expect(await t.run((ctx) => ctx.db.get(id))).not.toHaveProperty("note");
  });
});
