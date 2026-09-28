import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { fillTemplate, median } from "./lib/inquiry";

/** The team's tools on top of the inquiry inbox. See docs/inquiries.md → "Team tools". */

const serverKey = "test-server-key";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function asStaff(t: T, clerkUserId = "staff") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      firstName: clerkUserId,
      role: "admin",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
  return { staff: t.withIdentity({ subject: clerkUserId }), userId };
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

const account = { clerkUserId: "", emails: ["max@example.com"] };

describe("internal notes", () => {
  test("only the team sees them; the customer's page and thread never do", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id } = await create(t);

    await staff.mutation(api.marketing.inbox.addNote, { id, body: "  Kennt uns von der Messe  " });
    const detail = await staff.query(api.marketing.inbox.get, { id });
    expect(detail?.notes.map((note) => note.body)).toEqual(["Kennt uns von der Messe"]);
    expect(detail?.notes[0].authorName).toBe("staff");
    expect(detail?.messages).toEqual([]);

    const customer = await t.query(api.marketing.inquiries.getForAccount, {
      serverKey,
      account,
      id,
    });
    expect(JSON.stringify(customer)).not.toContain("Messe");
    // a note is no reply: nothing moves for the customer
    expect(customer?.inquiry.state).toBe("open");
  });

  test("only the author can edit or delete a note", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { staff: colleague } = await asStaff(t, "colleague");
    const { id } = await create(t);
    await staff.mutation(api.marketing.inbox.addNote, { id, body: "Erste Notiz" });
    const [note] = (await staff.query(api.marketing.inbox.get, { id }))!.notes;

    await expect(
      colleague.mutation(api.marketing.inbox.editNote, { noteId: note._id, body: "Geändert" }),
    ).rejects.toThrow();
    await staff.mutation(api.marketing.inbox.editNote, { noteId: note._id, body: "Geändert" });
    const edited = (await staff.query(api.marketing.inbox.get, { id }))!.notes[0];
    expect(edited.body).toBe("Geändert");
    expect(edited.editedAt).toBeTypeOf("number");

    await expect(
      colleague.mutation(api.marketing.inbox.deleteNote, { noteId: note._id }),
    ).rejects.toThrow();
    await staff.mutation(api.marketing.inbox.deleteNote, { noteId: note._id });
    expect((await staff.query(api.marketing.inbox.get, { id }))!.notes).toEqual([]);
  });

  test("go with the inquiry when the customer erases their history, and are in their export", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id } = await create(t);
    await staff.mutation(api.marketing.inbox.addNote, { id, body: "Rückruf später" });

    const exported = await t.query(api.marketing.account.exportForAccount, { serverKey, account });
    expect(exported.inquiries[0].teamNotes.map((note) => note.body)).toEqual(["Rückruf später"]);

    await t.mutation(api.marketing.account.eraseInquiryHistory, { serverKey, account });
    expect(await t.run((ctx) => ctx.db.query("inquiryNotes").collect())).toEqual([]);
  });
});

describe("tags", () => {
  test("are normalized, filter the list and search, and never reach the customer", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id } = await create(t);
    const { id: other } = await create(t, { email: "erika@example.com", firstName: "Erika" });

    const saved = await staff.mutation(api.marketing.inbox.setTags, {
      id,
      tags: ["  Pricing ", "#pricing", "Key Account", ""],
    });
    expect(saved).toEqual(["pricing", "key-account"]);

    const listed = await staff.query(api.marketing.inbox.list, {
      view: "all",
      tag: "pricing",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(listed.page.map((row) => row._id)).toEqual([id]);

    const found = await staff.query(api.marketing.inbox.search, { q: "#key-account", view: "all" });
    expect(found.results.map((row) => row._id)).toEqual([id]);
    const tagged = await staff.query(api.marketing.inbox.search, {
      q: "max",
      view: "all",
      tag: "pricing",
    });
    expect(tagged.results.map((row) => row._id)).toEqual([id]);

    expect(await staff.query(api.marketing.inbox.tagSuggestions, {})).toEqual([
      { tag: "key-account", count: 1 },
      { tag: "pricing", count: 1 },
    ]);

    const customer = await t.query(api.marketing.inquiries.getForAccount, {
      serverKey,
      account,
      id,
    });
    expect(JSON.stringify(customer)).not.toContain("pricing");
    expect(other).not.toBe(id);

    await staff.mutation(api.marketing.inbox.setTags, { id, tags: [] });
    expect((await t.run((ctx) => ctx.db.get(id)))?.tags).toBeUndefined();
  });
});

describe("reply templates", () => {
  test("fillTemplate fills known placeholders and drops empty ones cleanly", () => {
    expect(
      fillTemplate("Hallo {firstName}, danke für {reference}. Grüße {myFirstName}", {
        firstName: "Max",
        reference: "#ABC123",
        myFirstName: "Kaleb",
      }),
    ).toBe("Hallo Max, danke für #ABC123. Grüße Kaleb");
    expect(fillTemplate("Hallo {firstName},", {})).toBe("Hallo,");
    expect(fillTemplate("{firstName} von {company}", { firstName: "Max" })).toBe("Max von");
    expect(fillTemplate("Kosten: {price}", {})).toBe("Kosten: {price}");
  });

  test("are shared by the team, sorted by use, and deleted into the trash", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { staff: colleague } = await asStaff(t, "colleague");

    const a = await staff.mutation(api.marketing.templates.save, {
      title: "Danke",
      body: "Danke, {firstName}!",
      locale: "de",
    });
    const b = await staff.mutation(api.marketing.templates.save, {
      title: "Angebot",
      body: "Anbei das Angebot.",
    });
    await colleague.mutation(api.marketing.templates.markUsed, { id: b });
    expect((await colleague.query(api.marketing.templates.list, {})).map((row) => row._id)).toEqual(
      [b, a],
    );

    await colleague.mutation(api.marketing.templates.save, {
      id: a,
      title: "Danke",
      body: "Vielen Dank, {firstName}!",
      locale: "",
    });
    const edited = (await staff.query(api.marketing.templates.list, {})).find(
      (row) => row._id === a,
    );
    expect(edited?.body).toBe("Vielen Dank, {firstName}!");
    expect(edited?.locale).toBeUndefined();

    await expect(
      staff.mutation(api.marketing.templates.save, { title: " ", body: "x" }),
    ).rejects.toThrow();

    await staff.mutation(api.marketing.templates.remove, { id: b });
    expect((await staff.query(api.marketing.templates.list, {})).map((row) => row._id)).toEqual([
      a,
    ]);
    expect((await t.run((ctx) => ctx.db.get(b)))?.deletedAt).toBeTypeOf("number");
  });

  test("are only for people who work the inbox", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "someone",
        email: "someone@advantisgroup.de",
        role: "employee",
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
    await expect(
      t.withIdentity({ subject: "someone" }).query(api.marketing.templates.list, {}),
    ).rejects.toThrow();
  });
});

describe("who else is on it", () => {
  test("shows colleagues with the inquiry open, and who is writing; never yourself", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { staff: colleague } = await asStaff(t, "colleague");
    const { id } = await create(t);

    await staff.mutation(api.marketing.inbox.heartbeat, { id, typing: false });
    await colleague.mutation(api.marketing.inbox.heartbeat, { id, typing: true });

    expect(await colleague.query(api.marketing.inbox.viewers, { id })).toEqual([
      expect.objectContaining({ name: "staff", typing: false }),
    ]);
    expect(await staff.query(api.marketing.inbox.viewers, { id })).toEqual([
      expect.objectContaining({ name: "colleague", typing: true }),
    ]);

    // a second beat updates the same row
    await colleague.mutation(api.marketing.inbox.heartbeat, { id, typing: false });
    expect(await t.run((ctx) => ctx.db.query("inquiryViewers").collect())).toHaveLength(2);

    await colleague.mutation(api.marketing.inbox.leave, { id });
    expect(await staff.query(api.marketing.inbox.viewers, { id })).toEqual([]);
  });

  test("a heartbeat sweeps colleagues who stopped beating", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { userId: goneId } = await asStaff(t, "gone");
    const { id } = await create(t);
    await t.run((ctx) =>
      ctx.db.insert("inquiryViewers", { inquiryId: id, userId: goneId, typing: true, at: 0 }),
    );

    await staff.mutation(api.marketing.inbox.heartbeat, { id, typing: false });
    const rows = await t.run((ctx) => ctx.db.query("inquiryViewers").collect());
    expect(rows.map((row) => row.userId)).not.toContain(goneId);
  });
});

describe("merging duplicates", () => {
  test("folds one inquiry into another from the same customer", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id: first } = await create(t);
    const { id: second } = await create(t, { message: "Nochmal: Vertrieb, bitte melden" });
    await staff.mutation(api.marketing.inbox.addNote, { id: second, body: "Doppelt" });
    await staff.mutation(api.marketing.inbox.setTags, { id: second, tags: ["vertrieb"] });
    await t.mutation(api.marketing.inquiries.addCustomerMessage, {
      serverKey,
      account,
      id: second,
      body: "Und noch eine Frage",
    });

    const related = await staff.query(api.marketing.inbox.related, { id: second });
    expect(related.map((row) => [row._id, row.mergeable])).toEqual([[first, true]]);

    await staff.mutation(api.marketing.inbox.merge, { id: second, into: first });

    const target = (await staff.query(api.marketing.inbox.get, { id: first }))!;
    expect(target.messages.map((message) => message.body)).toEqual([
      "Nochmal: Vertrieb, bitte melden",
      "Und noch eine Frage",
    ]);
    expect(target.notes.map((note) => note.body)).toEqual(["Doppelt"]);
    expect(target.inquiry.tags).toEqual(["vertrieb"]);
    expect(target.events.at(-1)).toMatchObject({ type: "merged_in" });
    expect(target.events.at(-1)?.related?.id).toBe(second);

    const source = (await staff.query(api.marketing.inbox.get, { id: second }))!;
    expect(source.inquiry.state).toBe("closed");
    expect(source.mergedInto?.id).toBe(first);
    expect(source.messages).toEqual([]);

    // the customer is pointed at where the conversation went
    const customer = await t.query(api.marketing.inquiries.getForAccount, {
      serverKey,
      account,
      id: second,
    });
    expect(customer?.mergedInto?.id).toBe(first);

    // once merged, not again
    await expect(
      staff.mutation(api.marketing.inbox.merge, { id: second, into: first }),
    ).rejects.toThrow();

    // the merged one takes no more writing; a mail reply to it lands on the target
    await expect(
      t.mutation(api.marketing.inquiries.addCustomerMessage, {
        serverKey,
        account,
        id: second,
        body: "Hallo?",
      }),
    ).rejects.toThrow(/merged/);
    await expect(
      staff.mutation(api.marketing.inbox.reply, { id: second, body: "Hallo" }),
    ).rejects.toThrow(/merged/);
    expect(
      await t.mutation(api.marketing.inquiries.apiAddInboundReply, {
        serverKey,
        inquiryId: second,
        from: "Max <max@example.com>",
        body: "Per Mail",
      }),
    ).toEqual({ accepted: true });
    const after = (await staff.query(api.marketing.inbox.get, { id: first }))!;
    expect(after.messages.at(-1)?.body).toBe("Per Mail");
  });

  test("refuses another customer's inquiry and a callback still to come", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id: mine } = await create(t);
    const { id: theirs } = await create(t, { email: "erika@example.com" });
    const { id: callback } = await create(t, { submissionType: "callback", desiredAt: Date.now() });

    await expect(
      staff.mutation(api.marketing.inbox.merge, { id: theirs, into: mine }),
    ).rejects.toThrow(/different_customer/);
    await expect(
      staff.mutation(api.marketing.inbox.merge, { id: callback, into: mine }),
    ).rejects.toThrow(/active_callback/);
    expect(
      (await staff.query(api.marketing.inbox.related, { id: mine })).map((row) => [
        row._id,
        row.mergeable,
      ]),
    ).toEqual([[callback, false]]);
  });

  test("an open question folded into an answered one opens it again", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id: answered } = await create(t);
    await staff.mutation(api.marketing.inbox.reply, { id: answered, body: "Erledigt." });
    const { id: fresh } = await create(t, { message: "Noch was" });

    await staff.mutation(api.marketing.inbox.merge, { id: fresh, into: answered });
    expect((await t.run((ctx) => ctx.db.get(answered)))?.state).toBe("in_progress");
  });
});

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe("stats", () => {
  test("median", () => {
    expect(median([])).toBeUndefined();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  test("counts, response and close times against the period before", async () => {
    const t = setup();
    const { staff, userId } = await asStaff(t);
    const now = Date.now();
    const insert = (fields: Record<string, unknown>) =>
      t.run((ctx) =>
        ctx.db.insert("emails", {
          firstName: "A",
          lastName: "B",
          email: "a@example.com",
          subject: "",
          message: "Hallo",
          submissionType: "message",
          accountEmail: "",
          accountName: "",
          clerkUserId: "",
          status: "sent",
          ...fields,
        } as never),
      );

    // this period: answered after 2h and closed after a day, answered after 4h, one unanswered
    const sentA = now - 3 * DAY;
    await insert({
      sentAt: sentA,
      firstResponseAt: sentA + 2 * HOUR,
      state: "closed",
      closedAt: sentA + DAY,
      lastActivityAt: sentA + DAY,
      assignedToUserId: userId,
      tags: ["pricing"],
    });
    const sentB = now - 2 * DAY;
    await insert({
      sentAt: sentB,
      firstResponseAt: sentB + 4 * HOUR,
      state: "answered",
      lastActivityAt: sentB + 4 * HOUR,
      submissionType: "callback",
    });
    await insert({ sentAt: now - DAY, state: "open", lastActivityAt: now - DAY });
    // a duplicate merged away counts once, as the one it went into
    await insert({
      sentAt: now - DAY,
      state: "closed",
      closedAt: now - DAY,
      lastActivityAt: now - DAY,
      mergedIntoId: undefined,
    }).then((id) => t.run((ctx) => ctx.db.patch(id, { mergedIntoId: id })));
    // the period before
    await insert({
      sentAt: now - 40 * DAY,
      firstResponseAt: now - 40 * DAY + 10 * HOUR,
      state: "answered",
      lastActivityAt: now - 40 * DAY + 10 * HOUR,
    });

    const stats = await staff.query(api.marketing.stats.overview, {
      days: 30,
      until: now,
      tzOffsetMinutes: 0,
    });
    expect(stats.bucket).toBe("day");
    expect(stats.series).toHaveLength(30);
    expect(stats.totals).toMatchObject({
      received: 3,
      receivedBefore: 1,
      closed: 1,
      unanswered: 1,
      medianFirstResponseMs: 3 * HOUR,
      medianFirstResponseBeforeMs: 10 * HOUR,
      medianTimeToCloseMs: DAY,
    });
    expect(stats.series.reduce((sum, point) => sum + point.received, 0)).toBe(3);
    expect(stats.byType.find((row) => row.type === "callback")).toMatchObject({
      count: 1,
      medianFirstResponseMs: 4 * HOUR,
    });
    // the unassigned group leads, with no user attached
    expect(stats.byAssignee[0].count).toBe(2);
    expect(stats.byAssignee[0].userId).toBeUndefined();
    expect(stats.byAssignee.find((row) => row.userId === userId)).toMatchObject({
      count: 1,
      answered: 1,
      name: "staff",
    });
    expect(stats.tags).toEqual([{ tag: "pricing", count: 1 }]);

    const yearly = await staff.query(api.marketing.stats.overview, {
      days: 365,
      until: now,
      tzOffsetMinutes: -120,
    });
    expect(yearly.bucket).toBe("week");
    expect(yearly.totals.received).toBe(4);
  });
});

describe("auto-close", () => {
  test("closes answered inquiries left alone past the setting, quietly", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id: stale } = await create(t);
    const { id: recent } = await create(t);
    const { id: open } = await create(t);
    await staff.mutation(api.marketing.inbox.reply, { id: stale, body: "Antwort" });
    await staff.mutation(api.marketing.inbox.reply, { id: recent, body: "Antwort" });
    await t.run(async (ctx) => {
      await ctx.db.patch(stale, { lastActivityAt: Date.now() - 20 * DAY });
      await ctx.db.patch(open, { lastActivityAt: Date.now() - 20 * DAY });
    });

    expect(await staff.query(api.marketing.automation.settings, {})).toEqual({
      autoCloseDays: 14,
    });
    expect(await t.mutation(internal.marketing.automation.autoClose, {})).toEqual({ closed: 1 });
    const closed = (await staff.query(api.marketing.inbox.get, { id: stale }))!;
    expect(closed.inquiry.state).toBe("closed");
    expect(closed.events.at(-1)).toMatchObject({ type: "state", state: "closed", actor: "system" });
    expect((await t.run((ctx) => ctx.db.get(recent)))?.state).toBe("answered");
    expect((await t.run((ctx) => ctx.db.get(open)))?.state).toBe("open");

    // 0 switches it off
    await staff.mutation(api.marketing.automation.setAutoCloseDays, { days: 0 });
    await t.run((ctx) => ctx.db.patch(recent, { lastActivityAt: Date.now() - 400 * DAY }));
    expect(await t.mutation(internal.marketing.automation.autoClose, {})).toEqual({ closed: 0 });
    await expect(
      staff.mutation(api.marketing.automation.setAutoCloseDays, { days: 2.5 }),
    ).rejects.toThrow();
  });
});

describe("AI context", () => {
  test("carries the words, thread and notes but no address or phone", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id } = await create(t, { phone: "+49 911 123456", company: "Acme GmbH" });
    await staff.mutation(api.marketing.inbox.reply, { id, body: "Gern, wann passt es?" });
    await staff.mutation(api.marketing.inbox.addNote, { id, body: "Bestandskunde" });

    const context = await t.query(api.marketing.inbox.apiAiContext, {
      serverKey,
      clerkUserId: "staff",
      id,
    });
    expect(context.text).toContain("Wir brauchen Unterstützung im Vertrieb");
    expect(context.text).toContain("Gern, wann passt es?");
    expect(context.text).toContain("Bestandskunde");
    expect(context.text).toContain("Acme GmbH");
    expect(context.text).not.toContain("max@example.com");
    expect(context.text).not.toContain("123456");
    expect(context.locale).toBe("de");
  });

  test("is only for people who work the inbox", async () => {
    const t = setup();
    const { id } = await create(t);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: "someone",
        email: "someone@advantisgroup.de",
        role: "employee",
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
    await expect(
      t.query(api.marketing.inbox.apiAiContext, { serverKey, clerkUserId: "someone", id }),
    ).rejects.toThrow();
  });
});

describe("satisfaction", () => {
  test("the customer can say whether the answer helped, once there is one", async () => {
    const t = setup();
    const { staff } = await asStaff(t);
    const { id } = await create(t);
    const rate = (rating: "helpful" | "not_helpful", comment?: string) =>
      t.mutation(api.marketing.inquiries.rateByCustomer, {
        serverKey,
        account,
        id,
        rating,
        comment,
      });

    await expect(rate("helpful")).rejects.toThrow(/invalid_state/);
    await staff.mutation(api.marketing.inbox.reply, { id, body: "So geht's." });

    await rate("not_helpful", "  Hat nicht geklappt  ");
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ rating: "not_helpful", ratingComment: "Hat nicht geklappt" });
    // a "no" reaches the team
    const notes = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notes.some((n) => /unhelpful/.test(n.title))).toBe(true);

    // changing one's mind replaces it
    await rate("helpful");
    const customer = await t.query(api.marketing.inquiries.getForAccount, {
      serverKey,
      account,
      id,
    });
    expect(customer?.inquiry.rating).toBe("helpful");
    expect(customer?.inquiry.ratingComment).toBeUndefined();

    const stats = await staff.query(api.marketing.stats.overview, {
      days: 30,
      until: Date.now() + 60_000,
      tzOffsetMinutes: 0,
    });
    expect(stats.satisfaction).toMatchObject({ helpful: 1, notHelpful: 0 });
  });
});
