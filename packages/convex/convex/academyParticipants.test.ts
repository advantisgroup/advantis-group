import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

function asUser(t: T, clerkUserId: string) {
  return t.withIdentity({ subject: clerkUserId });
}

async function seedAdmin(t: T, clerkUserId = "admin"): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId,
      email: `${clerkUserId}@advantisgroup.de`,
      role: "admin",
      status: "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedEmployee(
  t: T,
  opts: { clerkUserId: string; email: string; status?: "active" | "suspended" },
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkUserId: opts.clerkUserId,
      email: opts.email,
      role: "employee",
      status: opts.status ?? "active",
      external: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedParticipant(
  t: T,
  opts: { academyId: string; email: string; linkedUserId?: Id<"users"> },
): Promise<Id<"academyParticipants">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("academyParticipants", {
      academyId: opts.academyId,
      name: "Unlinked Participant",
      email: opts.email,
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: Date.now(),
      linkedUserId: opts.linkedUserId,
    }),
  );
}

describe("academy participant auto-linking", () => {
  test("a plain email invite auto-links when the email matches an active account", async () => {
    const t = setup();
    const admin = await seedAdmin(t);
    await seedEmployee(t, { clerkUserId: "matched", email: "matched@advantisgroup.de" });

    const { participantId } = await asUser(t, "admin").mutation(api.academyParticipants.create, {
      academyId: "wallbox",
      name: "Ignored — resolved from the matched account",
      email: "matched@advantisgroup.de",
      pin: "unused",
    });
    void admin;

    const participant = await t.run(async (ctx) => ctx.db.get(participantId));
    expect(participant?.linkedUserId).not.toBeNull();
    expect(participant?.autoLinkedVia).toBe("email_match");
    expect(participant?.linkedByUserId).toBeUndefined();
  });

  test("does not auto-link to a suspended account", async () => {
    const t = setup();
    await seedAdmin(t);
    await seedEmployee(t, {
      clerkUserId: "suspended",
      email: "suspended@advantisgroup.de",
      status: "suspended",
    });

    const { participantId } = await asUser(t, "admin").mutation(api.academyParticipants.create, {
      academyId: "wallbox",
      name: "Someone",
      email: "suspended@advantisgroup.de",
      pin: "unused",
    });

    const participant = await t.run(async (ctx) => ctx.db.get(participantId));
    expect(participant?.linkedUserId).toBeUndefined();
    expect(participant?.autoLinkedVia).toBeUndefined();
  });

  test("an admin's explicit link is never tagged as auto-linked", async () => {
    const t = setup();
    await seedAdmin(t);
    const employeeId = await seedEmployee(t, {
      clerkUserId: "picked",
      email: "picked@advantisgroup.de",
    });

    const { participantId } = await asUser(t, "admin").mutation(api.academyParticipants.create, {
      academyId: "wallbox",
      name: "ignored",
      email: "ignored@example.com",
      linkUserId: employeeId,
      pin: "unused",
    });

    const participant = await t.run(async (ctx) => ctx.db.get(participantId));
    expect(participant?.linkedUserId).toBe(employeeId);
    expect(participant?.autoLinkedVia).toBeUndefined();
    expect(participant?.linkedByUserId).toBeDefined();
  });

  test("reconciliation links pre-existing unlinked rows by email, retroactively", async () => {
    const t = setup();
    await seedEmployee(t, { clerkUserId: "late", email: "late@advantisgroup.de" });
    const participantId = await seedParticipant(t, {
      academyId: "wallbox",
      email: "late@advantisgroup.de",
    });

    const { linked } = await t.mutation(internal.academyParticipants.reconcileAutoLinks, {});
    expect(linked).toBe(1);

    const participant = await t.run(async (ctx) => ctx.db.get(participantId));
    expect(participant?.linkedUserId).not.toBeNull();
    expect(participant?.autoLinkedVia).toBe("email_match");
  });

  test("reconciliation never touches a row that's already linked", async () => {
    const t = setup();
    const alreadyLinked = await seedEmployee(t, {
      clerkUserId: "already",
      email: "already@advantisgroup.de",
    });
    const participantId = await seedParticipant(t, {
      academyId: "wallbox",
      email: "someone-else@advantisgroup.de",
      linkedUserId: alreadyLinked,
    });

    const { linked } = await t.mutation(internal.academyParticipants.reconcileAutoLinks, {});
    expect(linked).toBe(0);

    const participant = await t.run(async (ctx) => ctx.db.get(participantId));
    expect(participant?.linkedUserId).toBe(alreadyLinked);
    expect(participant?.autoLinkedVia).toBeUndefined();
  });

  test("an admin picking the link by hand clears a prior auto-link tag", async () => {
    const t = setup();
    await seedAdmin(t);
    const autoMatch = await seedEmployee(t, {
      clerkUserId: "auto",
      email: "auto@advantisgroup.de",
    });
    const handPicked = await seedEmployee(t, {
      clerkUserId: "hand",
      email: "hand@advantisgroup.de",
    });
    const participantId = await seedParticipant(t, {
      academyId: "wallbox",
      email: "auto@advantisgroup.de",
    });
    await t.mutation(internal.academyParticipants.reconcileAutoLinks, {});
    let participant = await t.run(async (ctx) => ctx.db.get(participantId));
    expect(participant?.autoLinkedVia).toBe("email_match");
    void autoMatch;

    await asUser(t, "admin").mutation(api.academyParticipants.linkToAccount, {
      participantId,
      userId: handPicked,
      pin: "unused",
    });

    participant = await t.run(async (ctx) => ctx.db.get(participantId));
    expect(participant?.linkedUserId).toBe(handPicked);
    expect(participant?.autoLinkedVia).toBeUndefined();
  });
});
