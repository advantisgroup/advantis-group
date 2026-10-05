import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { sha256hex } from "../lib/crypto";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";
const me = { clerkUserId: "user_me", emails: ["me@example.com"] };
const someoneElse = { clerkUserId: "user_other", emails: ["other@example.com"] };

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

const create = (t: T, overrides: Record<string, unknown> = {}) =>
  t.mutation(api.marketing.inquiries.createInquiry, {
    serverKey,
    firstName: "Max",
    lastName: "Mustermann",
    email: "Me@Example.com",
    subject: "",
    message: "Hello\nA longer bit",
    submissionType: "message",
    locale: "de",
    accountEmail: "ME@example.com",
    accountName: "Max Mustermann",
    clerkUserId: "user_me",
    ...overrides,
  });

const list = (t: T, account = me) =>
  t.query(api.marketing.inquiries.listForAccount, { serverKey, account });

const row = (t: T, id: Id<"emails">) => t.run((ctx) => ctx.db.get(id));

describe("createInquiry", () => {
  test("numbers inquiries, lowercases addresses and logs a created event", async () => {
    const t = setup();
    const first = await create(t);
    const second = await create(t);

    // the reference is the end of the id, one character longer for every clash
    // (convex-test ids all end in "emails", so the second one needs more)
    expect(first.reference).toBe(`#${first.id.slice(-6).toUpperCase()}`);
    expect(second.reference).not.toBe(first.reference);
    expect(second.id.toUpperCase().endsWith(second.reference.slice(1))).toBe(true);
    expect(second.nr).toBe(2);
    const stored = await row(t, first.id);
    expect(stored).toMatchObject({
      email: "me@example.com",
      accountEmail: "me@example.com",
      status: "queued",
      state: "open",
    });
    const events = await t.run((ctx) =>
      ctx.db
        .query("inquiryEvents")
        .withIndex("by_inquiry_at", (q) => q.eq("inquiryId", first.id))
        .collect(),
    );
    expect(events.map((e) => e.type)).toEqual(["created"]);
  });
});

describe("listForAccount", () => {
  test("finds rows by Clerk id, account address and contact address", async () => {
    const t = setup();
    await create(t);
    await create(t, { clerkUserId: "user_old", accountEmail: "me@example.com" });
    // sent signed out from an address the account has verified
    await create(t, { clerkUserId: "", accountEmail: "", accountName: "" });
    await create(t, {
      clerkUserId: "user_other",
      accountEmail: "other@example.com",
      email: "other@example.com",
    });

    const { submissions, hasMore } = await list(t);
    expect(submissions).toHaveLength(3);
    expect(hasMore).toBe(false);
  });

  test("never hands the provider's error text to the browser", async () => {
    const t = setup();
    const { id } = await create(t);
    await t.mutation(api.marketing.inquiries.markTeamDelivery, {
      serverKey,
      id,
      status: "failed",
      error: "Resend said something technical",
      failureReason: "provider_error",
    });

    const [inquiry] = (await list(t)).submissions;
    expect(JSON.stringify(inquiry)).not.toContain("something technical");
    expect(inquiry.delivery).toMatchObject({ status: "failed", failureReason: "provider_error" });
  });
});

describe("getForAccount", () => {
  test("returns nothing for someone else's inquiry", async () => {
    const t = setup();
    const { id } = await create(t);
    expect(
      await t.query(api.marketing.inquiries.getForAccount, { serverKey, account: someoneElse, id }),
    ).toBeNull();
    expect(
      await t.query(api.marketing.inquiries.getForAccount, { serverKey, account: me, id }),
    ).not.toBeNull();
  });
});

describe("setStateByCustomer", () => {
  test("lets a customer withdraw an open inquiry but not close it", async () => {
    const t = setup();
    const { id } = await create(t);

    await expect(
      t.mutation(api.marketing.inquiries.setStateByCustomer, {
        serverKey,
        account: me,
        id,
        action: "resolve",
      }),
    ).rejects.toThrow(/resolve/);

    await t.mutation(api.marketing.inquiries.setStateByCustomer, {
      serverKey,
      account: me,
      id,
      action: "withdraw",
    });
    expect((await row(t, id))?.state).toBe("withdrawn");
  });

  test("turns a reopen note into a customer message", async () => {
    const t = setup();
    const { id } = await create(t);
    await t.run((ctx) => ctx.db.patch(id, { state: "answered" }));

    await t.mutation(api.marketing.inquiries.setStateByCustomer, {
      serverKey,
      account: me,
      id,
      action: "reopen",
      note: "Still broken",
    });
    const detail = await t.query(api.marketing.inquiries.getForAccount, {
      serverKey,
      account: me,
      id,
    });
    expect(detail?.inquiry.state).toBe("in_progress");
    expect(detail?.messages.map((m) => m.body)).toEqual(["Still broken"]);
  });

  test("refuses someone else's inquiry", async () => {
    const t = setup();
    const { id } = await create(t);
    await expect(
      t.mutation(api.marketing.inquiries.setStateByCustomer, {
        serverKey,
        account: someoneElse,
        id,
        action: "withdraw",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("delivery", () => {
  test("a retry updates the same row and a late webhook never moves it backwards", async () => {
    const t = setup();
    const { id } = await create(t);
    for (const status of ["failed", "sent"] as const) {
      await t.mutation(api.marketing.inquiries.markTeamDelivery, { serverKey, id, status });
    }
    const record = (eventType: string, bounceType?: string) =>
      t.mutation(api.marketing.inquiries.apiRecordMailEvent, {
        serverKey,
        inquiryId: id,
        mail: "team",
        eventType,
        bounceType,
        occurredAt: Date.now(),
      });

    await record("email.delivered");
    await record("email.sent");
    expect(await row(t, id)).toMatchObject({ status: "delivered", attempts: 2 });

    await record("email.bounced", "Permanent");
    expect(await row(t, id)).toMatchObject({
      status: "bounced",
      failureReason: "mailbox_unavailable",
    });
  });

  test("tracks the customer's receipt separately", async () => {
    const t = setup();
    const { id } = await create(t);
    await t.mutation(api.marketing.inquiries.markReceiptDelivery, {
      serverKey,
      id,
      copyStatus: "sent",
    });
    await t.mutation(api.marketing.inquiries.apiRecordMailEvent, {
      serverKey,
      inquiryId: id,
      mail: "receipt",
      eventType: "email.delivered",
      occurredAt: 123,
    });
    expect(await row(t, id)).toMatchObject({ copyStatus: "delivered", copyDeliveredAt: 123 });
  });
});

describe("callback links", () => {
  test("cancel and reschedule work with the token alone", async () => {
    const t = setup();
    const { id } = await create(t, { submissionType: "callback", message: "" });
    const tokenHash = await sha256hex("token");
    await t.run((ctx) =>
      ctx.db.patch(id, { actionTokenHash: tokenHash, actionTokenExpiresAt: Date.now() + 60_000 }),
    );

    const nextWeekday = new Date();
    nextWeekday.setUTCDate(nextWeekday.getUTCDate() + 7);
    while ([0, 6].includes(nextWeekday.getUTCDay())) {
      nextWeekday.setUTCDate(nextWeekday.getUTCDate() + 1);
    }
    nextWeekday.setUTCHours(10, 0, 0, 0);

    expect(
      await t.mutation(api.marketing.inquiries.rescheduleByToken, {
        serverKey,
        tokenHash,
        desiredAt: nextWeekday.getTime(),
      }),
    ).toEqual({ status: "requested" });
    expect(
      await t.mutation(api.marketing.inquiries.cancelByToken, { serverKey, tokenHash }),
    ).toEqual({ status: "cancelled" });
    expect(await row(t, id)).toMatchObject({ callbackStatus: "cancelled", state: "withdrawn" });
    expect(
      await t.mutation(api.marketing.inquiries.cancelByToken, {
        serverKey,
        tokenHash: await sha256hex("wrong"),
      }),
    ).toEqual({ status: "invalid" });
  });
});

describe("detachAccount", () => {
  test("unlinks rows from a deleted Clerk user", async () => {
    const t = setup();
    const { id } = await create(t, { email: "someone@else.com" });
    await t.mutation(api.marketing.inquiries.detachAccount, { serverKey, clerkUserId: "user_me" });
    expect(await row(t, id)).toMatchObject({ clerkUserId: "", accountEmail: "" });
    expect((await list(t)).submissions).toHaveLength(0);
  });
});
