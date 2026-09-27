/**
 * Company tools and favourites: admins keep the tools, links must be real web
 * addresses, and favourites stay intranet pages within the limit.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  for (const [clerkUserId, role] of [
    ["admin", "admin"],
    ["employee", "employee"],
  ] as const) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  return {
    admin: t.withIdentity({ subject: "admin" }),
    employee: t.withIdentity({ subject: "employee" }),
  };
}

describe("company tools", () => {
  test("admins add and reorder tools; everyone sees them in order", async () => {
    const { admin, employee } = await setup();
    await admin.mutation(api.org.tools.create, {
      name: "Clockodo",
      url: "https://my.clockodo.com",
    });
    const outlook = await admin.mutation(api.org.tools.create, {
      name: "Outlook",
      url: "https://outlook.office.com",
    });
    await admin.mutation(api.org.tools.move, { id: outlook, direction: "up" });
    expect((await employee.query(api.org.tools.list, {})).map((t) => t.name)).toEqual([
      "Outlook",
      "Clockodo",
    ]);
  });

  test("only admins change tools, and links must be web addresses", async () => {
    const { admin, employee } = await setup();
    await expect(
      employee.mutation(api.org.tools.create, { name: "X", url: "https://x.example" }),
    ).rejects.toThrow();
    await expect(
      admin.mutation(api.org.tools.create, { name: "X", url: "javascript:alert(1)" }),
    ).rejects.toThrow("The link must be a full web address");
  });
});

describe("favourite pages", () => {
  test("must be intranet paths, at most twelve", async () => {
    const { employee } = await setup();
    await employee.mutation(api.people.preferences.setMine, {
      favoritePages: [{ href: "/calendar", label: "Kalender" }],
    });
    await expect(
      employee.mutation(api.people.preferences.setMine, {
        favoritePages: [{ href: "https://evil.example", label: "x" }],
      }),
    ).rejects.toThrow("Favourites must be intranet pages");
    await expect(
      employee.mutation(api.people.preferences.setMine, {
        favoritePages: Array.from({ length: 13 }, (_, i) => ({ href: `/p${i}`, label: `${i}` })),
      }),
    ).rejects.toThrow("At most 12 favourites");
  });
});
