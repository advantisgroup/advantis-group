import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { TRASH_DAYS, TRASH_TABLES } from "../lib/trash";
import schema from "../schema";
import { modules } from "../test.setup";

/** Tables whose `deletedAt` means something else and must stay visible —
 *  a deleted chat message still shows as "message deleted". */
const OWN_DELETE_MEANING = new Set(["messages", "itTicketMessages"]);

describe("schema", () => {
  const tables = schema.tables as unknown as Record<
    string,
    { validator: { fields?: Record<string, unknown> }; " indexes"(): { indexDescriptor: string }[] }
  >;

  test("every table with deletedAt is either trash-filtered or listed as its own thing", () => {
    const withDeletedAt = Object.entries(tables)
      .filter(([, table]) => table.validator.fields && "deletedAt" in table.validator.fields)
      .map(([name]) => name);
    const uncovered = withDeletedAt.filter(
      (name) =>
        !(TRASH_TABLES as readonly string[]).includes(name) && !OWN_DELETE_MEANING.has(name),
    );
    expect(uncovered).toEqual([]);
  });

  test.each(TRASH_TABLES)("%s has deletedAt, deletedBy and a by_deletedAt index", (name) => {
    const table = tables[name];
    expect(table.validator.fields).toHaveProperty("deletedAt");
    expect(table.validator.fields).toHaveProperty("deletedBy");
    expect(table[" indexes"]().map((i) => i.indexDescriptor)).toContain("by_deletedAt");
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  const [adminId, aliceId, bobId] = await t.run(async (ctx) => {
    const insert = (clerkUserId: string, role: "admin" | "manager" | "employee") =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        role,
        status: "active",
        createdAt: 0,
      });
    return Promise.all([
      insert("admin", "admin"),
      insert("alice", "manager"),
      insert("bob", "employee"),
    ]);
  });
  return { t, adminId, aliceId, bobId };
}

async function seedTicket(t: ReturnType<typeof convexTest>, createdByUserId: Id<"users">) {
  return t.run(async (ctx) => {
    const ticketId = await ctx.db.insert("itTickets", {
      nr: 1,
      category: "Hardware",
      date: "2026-09-19",
      createdByName: "Bob",
      createdByUserId,
      status: "offen",
      createdAt: 0,
      updatedAt: 0,
    } as never);
    await ctx.db.insert("itTicketStatusHistory", {
      ticketId,
      status: "offen",
      changedAt: 0,
      changedByUserId: createdByUserId,
    } as never);
    return ticketId as Id<"itTickets">;
  });
}

describe("trash", () => {
  test("a deleted ticket disappears from reads but stays in the table", async () => {
    const { t, bobId } = await setup();
    const ticketId = await seedTicket(t, bobId);

    const bob = t.withIdentity({ subject: "bob" });
    expect(await bob.query(api.itTickets.tickets.list, {})).toHaveLength(1);
    await bob.mutation(api.itTickets.tickets.remove, { ticketId });
    expect(await bob.query(api.itTickets.tickets.list, {})).toHaveLength(0);

    const visible = await t.run(async (ctx) => {
      const row = await ctx.db.get(ticketId);
      return row?.deletedAt !== undefined;
    });
    expect(visible).toBe(true);

    const trash = await t.withIdentity({ subject: "bob" }).query(api.org.trash.list, {});
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ table: "itTickets", id: ticketId });
  });

  test("someone else's ticket can't be deleted by an employee", async () => {
    const { t, aliceId } = await setup();
    const ticketId = await seedTicket(t, aliceId);
    await expect(
      t.withIdentity({ subject: "bob" }).mutation(api.itTickets.tickets.remove, { ticketId }),
    ).rejects.toThrow("You do not have permission");
  });

  test("whoever deleted it, or an admin, can restore it — nobody else", async () => {
    const { t, bobId } = await setup();
    const ticketId = await seedTicket(t, bobId);
    await t.withIdentity({ subject: "bob" }).mutation(api.itTickets.tickets.remove, { ticketId });

    await expect(
      t
        .withIdentity({ subject: "alice" })
        .mutation(api.org.trash.restore, { table: "itTickets", id: ticketId }),
    ).rejects.toThrow("You do not have permission");

    await t
      .withIdentity({ subject: "admin" })
      .mutation(api.org.trash.restore, { table: "itTickets", id: ticketId });
    const row = await t.run((ctx) => ctx.db.get(ticketId));
    expect(row?.deletedAt).toBeUndefined();
    expect(await t.withIdentity({ subject: "bob" }).query(api.org.trash.list, {})).toHaveLength(0);
  });

  test("the purge only removes what's past the window, with its history", async () => {
    const { t, bobId } = await setup();
    const oldTicket = await seedTicket(t, bobId);
    const newTicket = await seedTicket(t, bobId);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch(oldTicket, {
        deletedAt: now - (TRASH_DAYS + 1) * 86_400_000,
        deletedBy: bobId,
      });
      await ctx.db.patch(newTicket, { deletedAt: now - 86_400_000, deletedBy: bobId });
    });

    expect(await t.mutation(internal.org.trash.purgeExpired, {})).toEqual({ purged: 1 });

    const left = await t.run(async (ctx) => ({
      old: await ctx.db.get(oldTicket),
      recent: await ctx.db.get(newTicket),
      history: await ctx.db.query("itTicketStatusHistory").collect(),
    }));
    expect(left.old).toBeNull();
    expect(left.recent).not.toBeNull();
    expect(left.history).toHaveLength(1);
  });
});
