/**
 * The status note next to someone's name: set, trimmed, cleared, and never
 * given an end that has already passed.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "alice",
      email: "alice@advantisgroup.de",
      role: "employee",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
  return { t, alice: t.withIdentity({ subject: "alice" }), userId };
}

describe("status message", () => {
  test("is set trimmed, shows on the profile, and clears with empty text", async () => {
    const { alice, userId } = await setup();
    const until = Date.now() + 24 * 60 * 60 * 1000;
    await alice.mutation(api.people.users.setStatusMessage, {
      text: "  Ab Montag zurück,   frag Anna ",
      until,
    });
    expect((await alice.query(api.people.users.get, { userId }))?.statusMessage).toEqual({
      text: "Ab Montag zurück, frag Anna",
      until,
    });

    await alice.mutation(api.people.users.setStatusMessage, { text: " " });
    expect((await alice.query(api.people.users.get, { userId }))?.statusMessage).toBeNull();
  });

  test("refuses an end in the past and overly long text", async () => {
    const { alice } = await setup();
    await expect(
      alice.mutation(api.people.users.setStatusMessage, { text: "Weg", until: Date.now() - 1 }),
    ).rejects.toThrow("The end must be in the future");
    await expect(
      alice.mutation(api.people.users.setStatusMessage, { text: "x".repeat(121) }),
    ).rejects.toThrow("Keep the status to 120 characters");
  });
});
