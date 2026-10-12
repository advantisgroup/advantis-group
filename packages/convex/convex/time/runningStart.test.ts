/** Earlier start for a running entry: admins directly, employees by request. */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { berlinInstant } from "./lib/berlin";

const local = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return berlinInstant("2026-10-12", h * 60 + m);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("TIME_MODE", "live");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("an employee asks for an earlier start, the admin approves it", async () => {
  const t = convexTest(schema, modules);
  const ids = {} as Record<"admin" | "alice", Id<"users">>;
  for (const [key, role] of [
    ["admin", "admin"],
    ["alice", "employee"],
  ] as const) {
    ids[key] = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: key,
        email: `${key}@advantisgroup.de`,
        firstName: key,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  const admin = t.withIdentity({ subject: "admin" });
  const alice = t.withIdentity({ subject: "alice" });

  vi.setSystemTime(local("08:40"));
  await alice.mutation(api.time.clock.clockIn, {});
  const running = await t.run(async (ctx) => (await ctx.db.query("timeEntries").collect())[0]);

  // Not later than now, not on another day.
  await expect(
    alice.mutation(api.time.entries.setRunningStart, {
      entryId: running._id,
      start: local("09:00"),
    }),
  ).rejects.toThrow();

  const result = await alice.mutation(api.time.entries.setRunningStart, {
    entryId: running._id,
    start: local("08:20"),
    reason: "Vergessen",
  });
  expect(result.applied).toBe(false);
  expect((await t.run((ctx) => ctx.db.get(running._id)))?.start).toBe(local("08:40"));

  const request = await t.run(async (ctx) =>
    (await ctx.db.query("timeEntries").collect()).find((row) => row.status === "pending"),
  );
  await admin.mutation(api.time.entries.decide, { entryId: request!._id, approve: true });
  const after = await t.run((ctx) => ctx.db.query("timeEntries").collect());
  expect(after.filter((row) => row.status === "active")).toHaveLength(1);
  const moved = after.find((row) => row._id === running._id)!;
  expect(moved.start).toBe(local("08:20"));
  expect(moved.end).toBeUndefined();

  // Admins change it directly.
  const direct = await admin.mutation(api.time.entries.setRunningStart, {
    entryId: running._id,
    start: local("08:10"),
  });
  expect(direct.applied).toBe(true);
});
