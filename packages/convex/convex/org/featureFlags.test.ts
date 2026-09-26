import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

async function asAdmin() {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "admin",
      email: "admin@advantisgroup.de",
      role: "admin",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
  return { t, admin: t.withIdentity({ subject: "admin" }) };
}

type T = ReturnType<typeof convexTest>;

const updates = (t: T) => t.run((ctx) => ctx.db.query("updates").collect());
const chat = async (admin: Awaited<ReturnType<typeof asAdmin>>["admin"]) =>
  (await admin.query(api.org.featureFlags.list, {})).find((f) => f.key === "chat");

test("turning a feature off only posts an update when asked to", async () => {
  const { t, admin } = await asAdmin();
  await admin.mutation(api.org.featureFlags.setFlag, { key: "chat", enabled: false });
  await admin.mutation(api.org.featureFlags.setFlag, { key: "chat", enabled: true });
  await admin.mutation(api.org.featureFlags.setFlag, {
    key: "chat",
    enabled: false,
    postUpdate: false,
  });
  expect(await updates(t)).toHaveLength(0);
  expect(await chat(admin)).toMatchObject({ enabled: false, hasUpdate: false });

  await admin.mutation(api.org.featureFlags.setFlag, { key: "chat", enabled: true });
  await admin.mutation(api.org.featureFlags.setFlag, {
    key: "chat",
    enabled: false,
    postUpdate: true,
  });
  expect(await updates(t)).toHaveLength(1);
  expect(await chat(admin)).toMatchObject({ enabled: false, hasUpdate: true });
});

test("a quiet turn-off after a posted one doesn't count as posted", async () => {
  const { t, admin } = await asAdmin();
  await admin.mutation(api.org.featureFlags.setFlag, {
    key: "chat",
    enabled: false,
    postUpdate: true,
  });
  await admin.mutation(api.org.featureFlags.setFlag, { key: "chat", enabled: true });
  await admin.mutation(api.org.featureFlags.setFlag, {
    key: "chat",
    enabled: false,
    postUpdate: false,
  });
  expect(await updates(t)).toHaveLength(1);
  expect(await chat(admin)).toMatchObject({ enabled: false, hasUpdate: false });
});

test("a deleted update no longer counts as posted and can be posted again", async () => {
  const { t, admin } = await asAdmin();
  await admin.mutation(api.org.featureFlags.setFlag, {
    key: "chat",
    enabled: false,
    postUpdate: true,
  });
  const [first] = await updates(t);
  await t.run((ctx) => ctx.db.patch(first!._id, { deletedAt: Date.now() }));
  expect(await chat(admin)).toMatchObject({ enabled: false, hasUpdate: false });

  await admin.mutation(api.org.featureFlags.postFlagUpdate, { key: "chat" });
  expect(await updates(t)).toHaveLength(2);
  expect(await chat(admin)).toMatchObject({ enabled: false, hasUpdate: true });
});
