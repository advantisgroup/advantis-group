/**
 * Phase 4 of docs/future-features/21_auth-consolidation.md: unlocking the
 * Applicant Management vault with a passkey, as an alternative to typing
 * its password. The actual WebAuthn assertion is verified in apps/api
 * (Web Crypto isn't available the same way here) — these tests exercise
 * what's left on the Convex side: `status`'s `hasPasskey` flag and the
 * server-key-gated `apiUnlockViaPasskey` mutation apps/api calls once it's
 * already confirmed the assertion resolves to the caller's own account.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = Object.fromEntries(
  Object.entries({
    ...import.meta.glob("./**/*.ts"),
    ...import.meta.glob("./**/*.js"),
  }).filter(([path]) => !/\.(test|config)\.ts$/.test(path) && !path.endsWith(".d.ts")),
) as Record<string, () => Promise<unknown>>;

const serverKey = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

function asUser(t: T, clerkUserId: string) {
  return t.withIdentity({ subject: clerkUserId });
}

async function seedMember(
  t: T,
  opts: { clerkUserId: string; applicantAccess?: boolean; role?: "admin" | "employee" },
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId: opts.clerkUserId,
      email: `${opts.clerkUserId}@advantisgroup.de`,
      role: opts.role ?? "employee",
      applicantAccess: opts.applicantAccess ?? true,
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedPasskey(t: T, userId: Id<"users">): Promise<void> {
  await t.run(async (ctx) =>
    ctx.db.insert("passkeys", {
      userId,
      credentialId: `cred_${userId}`,
      publicKey: "pk",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Test passkey",
      createdAt: Date.now(),
    }),
  );
}

describe("status", () => {
  test("hasPasskey is false with none registered, true once one exists", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });

    const before = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(before.hasPasskey).toBe(false);

    await seedPasskey(t, userId);
    const after = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(after.hasPasskey).toBe(true);
  });
});

describe("apiUnlockViaPasskey", () => {
  test("unlocks the vault for an applicant-area member", async () => {
    const t = setup();
    const userId = await seedMember(t, { clerkUserId: "alice" });
    await seedPasskey(t, userId);

    await t.mutation(api.applicantVault.apiUnlockViaPasskey, {
      serverKey,
      clerkUserId: "alice",
    });

    const status = await asUser(t, "alice").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(true);
    expect(status.expiresAt).not.toBeNull();

    const auditRows = await t.run(async (ctx) =>
      ctx.db
        .query("applicantAuditLog")
        .filter((q) => q.eq(q.field("actorUserId"), userId))
        .collect(),
    );
    expect(auditRows.some((r) => r.action === "vault_unlocked_via_passkey")).toBe(true);
  });

  test("rejects a caller with no applicant-area access", async () => {
    const t = setup();
    await seedMember(t, { clerkUserId: "outsider", applicantAccess: false });

    await expect(
      t.mutation(api.applicantVault.apiUnlockViaPasskey, {
        serverKey,
        clerkUserId: "outsider",
      }),
    ).rejects.toThrow("You do not have permission");
  });

  test("rejects an unknown clerkUserId", async () => {
    const t = setup();

    await expect(
      t.mutation(api.applicantVault.apiUnlockViaPasskey, {
        serverKey,
        clerkUserId: "nobody",
      }),
    ).rejects.toThrow("You do not have permission");
  });

  test("rejects a wrong server key", async () => {
    const t = setup();
    await seedMember(t, { clerkUserId: "alice" });

    await expect(
      t.mutation(api.applicantVault.apiUnlockViaPasskey, {
        serverKey: "wrong",
        clerkUserId: "alice",
      }),
    ).rejects.toThrow("Invalid server key");
  });

  test("an admin without the applicantAccess flag can still unlock", async () => {
    const t = setup();
    const userId = await seedMember(t, {
      clerkUserId: "admin",
      applicantAccess: false,
      role: "admin",
    });
    await seedPasskey(t, userId);

    await t.mutation(api.applicantVault.apiUnlockViaPasskey, {
      serverKey,
      clerkUserId: "admin",
    });

    const status = await asUser(t, "admin").query(api.applicantVault.status, {});
    expect(status.unlocked).toBe(true);
  });
});
