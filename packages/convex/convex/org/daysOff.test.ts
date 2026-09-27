/**
 * Office closures and the holiday region: admins set them, everyone reads the
 * ones overlapping the range they're looking at.
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
    t,
    admin: t.withIdentity({ subject: "admin" }),
    employee: t.withIdentity({ subject: "employee" }),
  };
}

describe("days off", () => {
  test("returns the region and only closures overlapping the range", async () => {
    const { admin, employee } = await setup();
    await admin.mutation(api.org.daysOff.setRegion, { region: "BY" });
    await admin.mutation(api.org.daysOff.addClosure, {
      title: "Zwischen den Jahren",
      startDate: "2026-12-28",
      endDate: "2027-01-01",
    });
    await admin.mutation(api.org.daysOff.addClosure, {
      title: "Betriebsausflug",
      startDate: "2026-07-10",
      endDate: "2026-07-10",
    });
    const dec = await employee.query(api.org.daysOff.inRange, {
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(dec.region).toBe("BY");
    expect(dec.closures.map((c) => c.title)).toEqual(["Zwischen den Jahren"]);
  });

  test("only admins change them, and bad input is refused", async () => {
    const { admin, employee } = await setup();
    await expect(
      employee.mutation(api.org.daysOff.addClosure, {
        title: "Frei",
        startDate: "2026-07-10",
        endDate: "2026-07-10",
      }),
    ).rejects.toThrow();
    await expect(admin.mutation(api.org.daysOff.setRegion, { region: "XX" })).rejects.toThrow(
      "Unknown region",
    );
    await expect(
      admin.mutation(api.org.daysOff.addClosure, {
        title: "Frei",
        startDate: "2026-07-10",
        endDate: "2026-07-09",
      }),
    ).rejects.toThrow("The end can't be before the start");
  });

  test("clearing the region goes back to nationwide", async () => {
    const { admin } = await setup();
    await admin.mutation(api.org.daysOff.setRegion, { region: "NW" });
    await admin.mutation(api.org.daysOff.setRegion, {});
    const res = await admin.query(api.org.daysOff.inRange, {
      start: "2026-01-01",
      end: "2026-01-31",
    });
    expect(res.region).toBeNull();
  });
});
