/**
 * IONOS mailbox panel: who sees it during the admins-only rollout, that a
 * mailbox's credentials only ever reach its owner, and what the poller turns
 * into notifications.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkUserId: string, role: "admin" | "employee") =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: clerkUserId,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      });
    return { admin: await user("admin", "admin"), anna: await user("anna", "employee") };
  });
  return { t, ...ids };
}

async function setAccount(
  t: Awaited<ReturnType<typeof setup>>["t"],
  userId: Awaited<ReturnType<typeof setup>>["admin"],
) {
  await t.mutation(api.mail.accounts.apiSetAccount, {
    serverKey,
    clerkUserId: "admin",
    userId,
    email: " Box@AdvantisGroup.de ",
    passwordEnc: "iv.tag.cipher",
  });
}

describe("mail accounts", () => {
  test("only admins see the panel before MAIL_MODE=live", async () => {
    const { t, admin, anna } = await setup();
    await setAccount(t, admin);
    await setAccount(t, anna);

    expect(await t.withIdentity({ subject: "anna" }).query(api.mail.accounts.myStatus, {})).toBe(
      null,
    );
    expect(await t.query(api.mail.accounts.apiMyAccount, { serverKey, clerkUserId: "anna" })).toBe(
      null,
    );
    const own = await t.withIdentity({ subject: "admin" }).query(api.mail.accounts.myStatus, {});
    expect(own).toMatchObject({ connected: true, email: "box@advantisgroup.de" });

    // Both are checked, so admins see a broken password before rollout.
    const targets = await t.query(internal.mail.poll.targets, {});
    expect(targets).toHaveLength(2);
    const list = await t.withIdentity({ subject: "admin" }).query(api.mail.accounts.adminList, {});
    expect(list.find((r) => r.userId === anna)?.checkedAt).toEqual(expect.any(Number));
  });

  test("credentials only reach the mailbox owner", async () => {
    const { t, anna } = await setup();
    await setAccount(t, anna);
    process.env.MAIL_MODE = "live";
    try {
      expect(
        await t.query(api.mail.accounts.apiMyAccount, { serverKey, clerkUserId: "admin" }),
      ).toBe(null);
      expect(
        await t.query(api.mail.accounts.apiMyAccount, { serverKey, clerkUserId: "anna" }),
      ).toEqual({ email: "box@advantisgroup.de", passwordEnc: "iv.tag.cipher" });
    } finally {
      delete process.env.MAIL_MODE;
    }
  });

  test("employees can't set a mailbox", async () => {
    const { t, anna } = await setup();
    await expect(
      t.mutation(api.mail.accounts.apiSetAccount, {
        serverKey,
        clerkUserId: "anna",
        userId: anna,
        email: "anna@advantisgroup.de",
        passwordEnc: "x",
      }),
    ).rejects.toThrow();
  });
});

describe("mail poll", () => {
  async function pollOnce(
    t: Awaited<ReturnType<typeof setup>>["t"],
    result: { uidValidity: string; uidNext: number; newCount: number; uids?: number[] },
  ) {
    const [target] = await t.query(internal.mail.poll.targets, {});
    await t.mutation(internal.mail.poll.record, {
      results: [
        {
          id: target!.id,
          updatedAt: target!.updatedAt,
          ok: true,
          uidValidity: result.uidValidity,
          uidNext: result.uidNext,
          unseen: 2,
          newCount: result.newCount,
          newMessages: (result.uids ?? []).map((uid) => ({
            uid,
            from: "Kunde",
            subject: `Betreff ${uid}`,
          })),
        },
      ],
    });
  }

  const notifications = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
    t.run((ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("type"), "mail_received"))
        .collect(),
    );

  test("first poll sets a baseline, later polls notify", async () => {
    const { t, admin } = await setup();
    await setAccount(t, admin);

    await pollOnce(t, { uidValidity: "7", uidNext: 50, newCount: 40, uids: [40, 41] });
    expect(await notifications(t)).toHaveLength(0);

    await pollOnce(t, { uidValidity: "7", uidNext: 52, newCount: 2, uids: [50, 51] });
    const sent = await notifications(t);
    expect(sent.map((n) => n.link).sort()).toEqual(["/?postfach=50", "/?postfach=51"]);
    expect(sent[0]!.title).toBe("Neue E-Mail von Kunde");

    await pollOnce(t, { uidValidity: "7", uidNext: 60, newCount: 8, uids: [57, 58, 59] });
    expect((await notifications(t)).at(-1)!.title).toBe("8 neue E-Mails");

    const status = await t.withIdentity({ subject: "admin" }).query(api.mail.accounts.myStatus, {});
    expect(status).toMatchObject({ unseen: 2, error: null });
  });

  test("before MAIL_MODE=live employees are checked but not notified", async () => {
    const { t, anna } = await setup();
    await setAccount(t, anna);
    await pollOnce(t, { uidValidity: "7", uidNext: 50, newCount: 0 });
    await pollOnce(t, { uidValidity: "7", uidNext: 52, newCount: 2, uids: [50, 51] });
    expect(await notifications(t)).toHaveLength(0);
    const [row] = await t.run((ctx) => ctx.db.query("mailAccounts").collect());
    expect(row).toMatchObject({ uidNext: 52, unseen: 2 });
  });

  test("a changed UIDVALIDITY resets the baseline without notifying", async () => {
    const { t, admin } = await setup();
    await setAccount(t, admin);
    await pollOnce(t, { uidValidity: "7", uidNext: 50, newCount: 0 });
    await pollOnce(t, { uidValidity: "8", uidNext: 3, newCount: 2, uids: [1, 2] });
    expect(await notifications(t)).toHaveLength(0);
  });

  test("a failed login alerts admins once", async () => {
    const { t, admin } = await setup();
    await setAccount(t, admin);
    const fail = async () => {
      const [target] = await t.query(internal.mail.poll.targets, {});
      await t.mutation(internal.mail.poll.record, {
        results: [{ id: target!.id, updatedAt: target!.updatedAt, ok: false, error: "auth" }],
      });
    };
    await fail();
    await fail();
    const alerts = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("type"), "system_alert"))
        .collect(),
    );
    expect(alerts).toHaveLength(1);
  });
});
