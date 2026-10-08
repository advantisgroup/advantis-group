import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const HOUR = 60 * 60 * 1000;
const at = (offsetHours: number) => Date.now() + offsetHours * HOUR;

async function setup() {
  const t = convexTest(schema, modules);
  const ids = {} as Record<"admin" | "lead" | "alice" | "carl", Id<"users">>;
  for (const [key, role, firstName] of [
    ["admin", "admin", "Ada"],
    ["lead", "employee", "Lena"],
    ["alice", "employee", "Alice"],
    ["carl", "employee", "Carl"],
  ] as const) {
    ids[key] = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: key,
        email: `${key}@advantisgroup.de`,
        firstName,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  // Lena leads Sales with Alice in it; Carl is on no team.
  await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Sales",
      slug: "sales",
      reportsToUserId: ids.lead,
      createdAt: Date.now(),
      createdBy: ids.admin,
    });
    await ctx.db.insert("userTeams", { userId: ids.alice, teamId });
  });
  return {
    t,
    ids,
    admin: t.withIdentity({ subject: "admin" }),
    lead: t.withIdentity({ subject: "lead" }),
    alice: t.withIdentity({ subject: "alice" }),
    carl: t.withIdentity({ subject: "carl" }),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function notificationsOf(t: Setup["t"], userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

describe("appointments", () => {
  test("a team lead books with their team only; the employee sees and can decline", async () => {
    const s = await setup();
    const contacts = await s.lead.query(api.appointments.contacts, {});
    expect(contacts.isLead).toBe(true);
    expect(contacts.attendees.map((p) => p.name)).toEqual(["Alice"]);

    await expect(
      s.lead.mutation(api.appointments.create, {
        attendeeIds: [s.ids.carl],
        title: "Feedback",
        start: at(24),
        end: at(25),
      }),
    ).rejects.toThrow();

    const id = await s.lead.mutation(api.appointments.create, {
      attendeeIds: [s.ids.alice],
      title: "Feedback",
      start: at(24),
      end: at(25),
    });
    expect((await notificationsOf(s.t, s.ids.alice)).map((n) => n.title)).toEqual([
      "Neuer Termin: Feedback",
    ]);

    const range = { start: at(0), end: at(48) };
    expect(await s.alice.query(api.appointments.listForRange, range)).toHaveLength(1);
    expect(await s.carl.query(api.appointments.listForRange, range)).toHaveLength(0);
    // Admins see only their own appointments here too.
    expect(await s.admin.query(api.appointments.listForRange, range)).toHaveLength(0);

    await expect(s.alice.mutation(api.appointments.decline, { id, reason: " " })).rejects.toThrow();
    await s.alice.mutation(api.appointments.decline, { id, reason: "Kundentermin" });
    const [row] = await s.lead.query(api.appointments.listForRange, range);
    expect(row.attendees[0].declined).toBe("Kundentermin");
    expect((await notificationsOf(s.t, s.ids.lead)).map((n) => n.title)).toEqual([
      "Absage: Feedback",
    ]);
  });

  test("employees ask their lead or an admin; the lead answers", async () => {
    const s = await setup();
    const forAlice = await s.alice.query(api.appointments.contacts, {});
    expect(forAlice.isLead).toBe(false);
    expect(forAlice.recipients.map((p) => p.name).sort()).toEqual(["Ada", "Lena"]);
    const forCarl = await s.carl.query(api.appointments.contacts, {});
    expect(forCarl.recipients.map((p) => p.name)).toEqual(["Ada"]);

    await expect(
      s.carl.mutation(api.appointments.request, {
        organizerId: s.ids.lead,
        title: "Gespräch",
        start: at(24),
        end: at(25),
      }),
    ).rejects.toThrow();

    const id = await s.alice.mutation(api.appointments.request, {
      organizerId: s.ids.lead,
      title: "Urlaubsplanung",
      start: at(24),
      end: at(25),
    });
    const inbox = await s.lead.query(api.appointments.inbox, {});
    expect(inbox.toAnswer.map((row) => row.title)).toEqual(["Urlaubsplanung"]);
    expect((await s.alice.query(api.appointments.inbox, {})).mine).toHaveLength(1);

    // Only the person asked answers.
    await expect(s.carl.mutation(api.appointments.respond, { id, accept: true })).rejects.toThrow();
    const newStart = at(26);
    await s.lead.mutation(api.appointments.respond, {
      id,
      accept: true,
      start: newStart,
      end: newStart + HOUR,
    });
    const [row] = await s.alice.query(api.appointments.listForRange, {
      start: at(0),
      end: at(48),
    });
    expect(row).toMatchObject({ status: "confirmed", start: newStart });
    expect((await notificationsOf(s.t, s.ids.alice)).map((n) => n.title)).toEqual([
      "Termin bestätigt – neue Zeit: Urlaubsplanung",
    ]);
  });

  test("a declined request needs a reason; a request can be withdrawn", async () => {
    const s = await setup();
    const first = await s.alice.mutation(api.appointments.request, {
      organizerId: s.ids.admin,
      title: "Gehalt",
      start: at(24),
      end: at(25),
    });
    await expect(
      s.admin.mutation(api.appointments.respond, { id: first, accept: false }),
    ).rejects.toThrow();
    await s.admin.mutation(api.appointments.respond, {
      id: first,
      accept: false,
      note: "Bitte nächste Woche",
    });
    expect(
      await s.alice.query(api.appointments.listForRange, { start: at(0), end: at(48) }),
    ).toHaveLength(0);

    const second = await s.alice.mutation(api.appointments.request, {
      organizerId: s.ids.admin,
      title: "Gehalt",
      start: at(30),
      end: at(31),
    });
    await s.alice.mutation(api.appointments.cancel, { id: second });
    expect((await s.admin.query(api.appointments.inbox, {})).toAnswer).toHaveLength(0);
  });

  test("the organizer moves an appointment and everyone is asked again", async () => {
    const s = await setup();
    const id = await s.admin.mutation(api.appointments.create, {
      attendeeIds: [s.ids.alice, s.ids.carl],
      title: "Schulung",
      start: at(24),
      end: at(26),
    });
    await s.carl.mutation(api.appointments.decline, { id, reason: "Krank" });
    await expect(
      s.alice.mutation(api.appointments.update, {
        id,
        title: "Schulung",
        start: at(48),
        end: at(50),
        attendeeIds: [s.ids.alice],
      }),
    ).rejects.toThrow();
    await s.admin.mutation(api.appointments.update, {
      id,
      title: "Schulung",
      start: at(48),
      end: at(50),
      attendeeIds: [s.ids.alice, s.ids.carl],
    });
    const [row] = await s.carl.query(api.appointments.listForRange, {
      start: at(40),
      end: at(60),
    });
    expect(row.attendees.every((a) => a.declined === null)).toBe(true);
    await s.admin.mutation(api.appointments.cancel, { id, reason: "Fällt aus" });
    expect(
      await s.carl.query(api.appointments.listForRange, { start: at(40), end: at(60) }),
    ).toHaveLength(0);
  });
});
