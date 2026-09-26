import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function asStaff(t: T) {
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "staff",
      email: "staff@advantisgroup.de",
      role: "admin",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
  return t.withIdentity({ subject: "staff" });
}

const create = (t: T, overrides: Record<string, unknown> = {}) =>
  t.mutation(api.marketing.inquiries.createInquiry, {
    serverKey,
    firstName: "Max",
    lastName: "Mustermann",
    email: "max@example.com",
    subject: "",
    message: "Wir brauchen Unterstützung im Vertrieb",
    submissionType: "message",
    locale: "de",
    accountEmail: "",
    accountName: "",
    clerkUserId: "",
    ...overrides,
  });

// a row from before refs were stored: its reference is "#" + the last six characters of its id
const legacy = (t: T) =>
  t.run((ctx) =>
    ctx.db.insert("emails", {
      firstName: "Erika",
      lastName: "Musterfrau",
      email: "erika@example.com",
      phone: "+49 911 37753859",
      subject: "",
      message: "Alte Anfrage",
      submissionType: "message",
      accountEmail: "",
      accountName: "",
      clerkUserId: "",
      sentAt: Date.now() - 1000,
      status: "sent",
    }),
  );

describe("references", () => {
  test("opens an inquiry from its id, its reference in any spelling, or an early AG- number", async () => {
    const t = setup();
    const staff = await asStaff(t);
    const { id, reference } = await create(t);
    const code = reference.slice(1);

    for (const ref of [id, reference, code, code.toLowerCase(), "AG-0001", "ag-0001", "0001"]) {
      expect((await staff.query(api.marketing.inbox.get, { id: ref }))?.inquiry._id).toBe(id);
    }
    expect(await staff.query(api.marketing.inbox.get, { id: "#ZZZZZZ" })).toBeNull();
    expect(await staff.query(api.marketing.inbox.get, { id: "AG-9999" })).toBeNull();
    expect(await staff.query(api.marketing.inbox.get, { id: "not an id!" })).toBeNull();
  });

  test("an older inquiry keeps its six characters; the newer one that ends the same takes more", async () => {
    const t = setup();
    const staff = await asStaff(t);
    const old = await legacy(t);
    const { id, reference } = await create(t);
    const oldCode = old.slice(-6);

    // convex-test ids share their ending, so the new one had to step past the old one's
    expect(reference.length).toBeGreaterThan(7);
    expect((await staff.query(api.marketing.inbox.get, { id: `#${oldCode}` }))?.inquiry._id).toBe(
      old,
    );
    expect((await staff.query(api.marketing.inbox.get, { id: reference }))?.inquiry._id).toBe(id);

    // storing refs for old rows changes nothing anyone has already seen
    await t.mutation(internal.migrations.backfillInquiries.refs, {});
    expect((await t.run((ctx) => ctx.db.get(old)))?.ref).toBe(oldCode);
    expect((await t.run((ctx) => ctx.db.get(id)))?.ref).toBe(reference.slice(1).toLowerCase());
  });
});

describe("search", () => {
  const search = (staff: Awaited<ReturnType<typeof asStaff>>, q: string) =>
    staff.query(api.marketing.inbox.search, { q, view: "all" });

  test("finds by partial reference, name, address, company, message and phone digits", async () => {
    const t = setup();
    const staff = await asStaff(t);
    const { id } = await create(t, { company: "Acme GmbH" });
    const old = await legacy(t);

    const ids = async (q: string) => (await search(staff, q)).results.map((row) => row._id);

    expect(await ids("AG-000")).toEqual([id]);
    // convex-test ids all end in the table name, so a partial id from their distinct middle
    expect(await ids(old.slice(-10, -6))).toEqual([old]);
    expect(await ids("mustermann")).toEqual([id]);
    expect(await ids("acme")).toEqual([id]);
    expect(await ids("erika@")).toEqual([old]);
    expect(await ids("vertrieb")).toEqual([id]);
    expect(await ids("0911/3775")).toEqual([old]);
    expect(await ids("max vertrieb")).toEqual([id]);
    expect(await ids("max erika")).toEqual([]);
  });

  test("respects the tab and hides anonymized inquiries", async () => {
    const t = setup();
    const staff = await asStaff(t);
    const { id } = await create(t);
    await t.run((ctx) => ctx.db.patch(id, { state: "closed" }));

    expect(
      (await staff.query(api.marketing.inbox.search, { q: "max", view: "open" })).results,
    ).toEqual([]);
    expect((await search(staff, "max")).results).toHaveLength(1);

    await t.run((ctx) => ctx.db.patch(id, { anonymizedAt: Date.now() }));
    expect((await search(staff, "AG-0001")).results).toEqual([]);
  });
});

describe("what the customer sees of the team's work", () => {
  test("opening an inquiry tells them nothing; assigning it shows someone is on it", async () => {
    const t = setup();
    const staff = await asStaff(t);
    const { id } = await create(t);
    const account = { clerkUserId: "", emails: ["max@example.com"] };
    const view = () => t.query(api.marketing.inquiries.getForAccount, { serverKey, account, id });

    await staff.mutation(api.marketing.inbox.markSeen, { id });
    const opened = await view();
    expect(opened?.inquiry.state).toBe("open");
    expect(opened?.handledAt).toBeUndefined();
    expect(JSON.stringify(opened)).not.toMatch(/seen/i);

    const me = await t.run((ctx) => ctx.db.query("users").first());
    await staff.mutation(api.marketing.inbox.assign, { id, userId: me!._id });
    const assigned = await view();
    expect(assigned?.inquiry.state).toBe("in_progress");
    expect(assigned?.handledAt).toBeTypeOf("number");
  });
});
