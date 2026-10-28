/**
 * Onboarding-Cockpit: import (re-import keeps the intranet's status and
 * assignee, missing customers are flagged, not deleted), prio lists, the
 * contact log and who sees what (admins all, others their own once live).
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  customerKey,
  followUpBucket,
  guessColumns,
  reportRows,
  statusFromReport,
  balancedSplit,
  DEFAULT_STATUS_CONFIG,
  milestonesOf,
  pathLabel,
  phaseFor,
  setMilestone,
  suggestFollowUp,
  validateStatusConfig,
} from "./lib/onboarding";

describe("onboarding helpers", () => {
  test("customer numbers match regardless of zeros and Excel decimals", () => {
    expect(customerKey("000663470")).toBe("663470");
    expect(customerKey("663470.0")).toBe("663470");
    expect(customerKey(663470)).toBe("663470");
    expect(customerKey("")).toBe("");
  });

  test("status guess from the report", () => {
    expect(statusFromReport("Fresh")).toBe("fresh");
    expect(statusFromReport("Progress Step 1")).toBe("step1");
    expect(statusFromReport("Progress Step 2")).toBe("step2");
    expect(statusFromReport("Progress Step 3")).toBe("step3");
    expect(statusFromReport("Done")).toBe("done");
    expect(statusFromReport(undefined)).toBe("fresh");
  });

  test("columns are guessed and the rest kept as report fields", () => {
    const headers = ["Account Name", "Customer Number", "Onboarding Status", "Owner", "Ort"];
    const map = guessColumns(headers);
    expect(map).toEqual({
      number: 1,
      name: 0,
      status: 2,
      accountStatus: -1,
      closeDate: -1,
      owner: 3,
      date: -1,
    });
    const { rows, skipped, duplicates } = reportRows(
      headers,
      [
        ["Firma A", "0001", "Fresh", "Lea", "Nürnberg"],
        ["Firma A doppelt", "1", "Fresh", "Lea", ""],
        ["Ohne Nummer", "", "Fresh", "Lea", ""],
      ],
      map,
    );
    expect(skipped).toBe(1);
    expect(duplicates).toBe(1);
    expect(rows).toEqual([
      {
        customerNumber: "0001",
        name: "Firma A",
        reportStatus: "Fresh",
        reportOwner: "Lea",
        reportDate: undefined,
        accountStatus: undefined,
        closeDate: undefined,
        fields: [{ label: "Ort", value: "Nürnberg" }],
      },
    ]);
  });

  test("account status and close date win over the general columns", () => {
    expect(
      guessColumns([
        "Account Name",
        "Customer Number",
        "Account Status",
        "Close Date",
        "Created Date",
      ]),
    ).toMatchObject({ accountStatus: 2, closeDate: 3, status: -1, date: 4 });
  });

  test("phase follows the milestones; ticks keep their order", () => {
    expect(phaseFor([], false)).toBe("fresh");
    expect(phaseFor([], true)).toBe("step1");
    expect(phaseFor(["cards"], true)).toBe("step2");
    expect(phaseFor(["cards", "fuel"], true)).toBe("step3");
    expect(phaseFor(["cards", "fuel", "twoMonth"], true)).toBe("done");
    // Ticking "fuel" ticks "cards" too; unticking "cards" unticks the rest.
    expect(setMilestone([], "fuel", true)).toEqual(["cards", "fuel"]);
    expect(setMilestone(["cards", "fuel"], "cards", false)).toEqual([]);
    // First versions: stage ids and step timestamps.
    expect(milestonesOf({ milestonesDone: ["step1", "step2"] })).toEqual(["cards", "fuel"]);
    expect(milestonesOf({ cardsOrderedAt: 1 })).toEqual(["cards"]);
  });

  test("situation tree: labels and no deleting", () => {
    const c = DEFAULT_STATUS_CONFIG;
    expect(pathLabel(c, ["case", "case.login", "case.login.welcome"])).toBe(
      "Case eröffnet › login problem › no welcome mail",
    );
    expect(pathLabel(c, ["s1.case"])).toBeNull();
    expect(validateStatusConfig(c, c)).toEqual([]);
    expect(validateStatusConfig({ outcomes: c.outcomes.slice(1) }, c).length).toBeGreaterThan(0);
    // "Follow-up" is not offered when logging a contact any more.
    expect(c.outcomes.filter((o) => !o.archived).map((o) => o.id)).toEqual([
      "reached",
      "notReached",
      "case",
      "cancel",
    ]);
  });

  test("follow-up suggestions: +2 days / 1 week / 2 months, quarter hour, no weekend", () => {
    // Wednesday 28.10.2026 15:37 Berlin (CET, UTC+1) → Friday 15:45.
    const wed = new Date("2026-10-28T14:37:00Z");
    expect(suggestFollowUp(wed, "contact")).toEqual({ date: "2026-10-30", time: "15:45" });
    // Thursday → Saturday → Monday; Friday → Sunday → Monday.
    expect(suggestFollowUp(new Date("2026-10-29T09:00:00Z"), "contact")).toEqual({
      date: "2026-11-02",
      time: "10:00",
    });
    expect(suggestFollowUp(new Date("2026-10-30T09:01:00Z"), "contact").date).toBe("2026-11-02");
    // Cards ordered: one week; fuelled: two months.
    expect(suggestFollowUp(wed, "cards")).toEqual({ date: "2026-11-04", time: "15:45" });
    expect(suggestFollowUp(wed, "fuel")).toEqual({ date: "2026-12-28", time: "15:45" });
    // Late evening is capped at the last slot.
    expect(suggestFollowUp(new Date("2026-10-28T21:50:00Z"), "contact").time).toBe("21:45");
  });

  test("balanced split fills the emptiest first", () => {
    expect(balancedSplit([100, 50], 100)).toEqual([25, 75]);
    expect(balancedSplit([10, 0, 30], 20)).toEqual([5, 15, 0]);
    expect(balancedSplit([5, 5, 5], 7)).toEqual([3, 2, 2]);
    expect(balancedSplit([0, 0], 0)).toEqual([0, 0]);
    // Everyone above the target still gets nothing; total always adds up.
    const split = balancedSplit([3, 40, 7, 12], 33);
    expect(split.reduce((a, b) => a + b, 0)).toBe(33);
    expect(split[1]).toBe(0);
  });

  test("follow-up buckets", () => {
    expect(followUpBucket("2026-10-26", "2026-10-27")).toBe("overdue");
    expect(followUpBucket("2026-10-27", "2026-10-27")).toBe("today");
    expect(followUpBucket("2026-11-03", "2026-10-27")).toBe("week");
    expect(followUpBucket("2026-11-04", "2026-10-27")).toBe("later");
    expect(followUpBucket(undefined, "2026-10-27")).toBe("none");
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (clerkUserId: string, role: "admin" | "employee", first: string) =>
      ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@advantisgroup.de`,
        firstName: first,
        lastName: "Test",
        role,
        status: "active",
        external: false,
        createdAt: now,
      });
    return {
      admin: await user("admin", "admin", "Ada"),
      melina: await user("melina", "employee", "Melina"),
      doreen: await user("doreen", "employee", "Doreen"),
    };
  });
  return { t, ids, as: (subject: string) => t.withIdentity({ subject }) };
}

type Row = { customerNumber: string; name?: string; reportStatus?: string };

type Session = ReturnType<Awaited<ReturnType<typeof setup>>["as"]>;

async function importReport(as: Session, rows: Row[]) {
  const importId = await as.mutation(api.performance.onboarding.importStart, {
    kind: "report",
    fileName: "KI_Onboarding_all.xlsx",
  });
  await as.mutation(api.performance.onboarding.importReportChunk, { importId, rows });
  return await as.mutation(api.performance.onboarding.importFinish, { importId });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("onboarding cockpit", () => {
  test("only admins until ONBOARDING_MODE is live", async () => {
    const { as } = await setup();
    expect(await as("melina").query(api.performance.onboarding.me, {})).toMatchObject({
      access: false,
    });
    await expect(as("melina").query(api.performance.onboarding.list, {})).rejects.toThrow();
    expect(await as("admin").query(api.performance.onboarding.me, {})).toMatchObject({
      access: true,
      canManage: true,
    });
  });

  test("re-import keeps status and assignee, flags customers that dropped out", async () => {
    const { as, ids } = await setup();
    const admin = as("admin");
    const first = await importReport(admin, [
      { customerNumber: "100", name: "Alpha", reportStatus: "Fresh" },
      { customerNumber: "200", name: "Beta", reportStatus: "Progress Step 1" },
    ]);
    expect(first).toMatchObject({ created: 2, updated: 0, missing: 0 });

    let cases = await admin.query(api.performance.onboarding.list, {});
    const alpha = cases.find((c) => c.customerNumber === "100")!;
    expect(cases.find((c) => c.customerNumber === "200")!.status).toBe("step1");
    await admin.mutation(api.performance.onboarding.update, {
      caseId: alpha._id,
      milestone: { key: "cards", done: true },
      assigneeUserId: ids.melina,
      nextFollowUp: "2026-11-02",
    });

    const second = await importReport(admin, [
      { customerNumber: "0100", name: "Alpha GmbH", reportStatus: "Fresh" },
      { customerNumber: "300", name: "Gamma" },
    ]);
    expect(second).toMatchObject({ created: 1, updated: 1, missing: 1 });

    cases = await admin.query(api.performance.onboarding.list, {});
    expect(cases).toHaveLength(3);
    const again = cases.find((c) => c._id === alpha._id)!;
    expect(again).toMatchObject({
      name: "Alpha GmbH",
      status: "step2",
      assigneeUserId: ids.melina,
      nextFollowUp: "2026-11-02",
      inReport: true,
    });
    expect(cases.find((c) => c.customerNumber === "200")!.inReport).toBe(false);
  });

  test("prio list marks matching cases and counts unknown numbers", async () => {
    const { as } = await setup();
    const admin = as("admin");
    await importReport(admin, [{ customerNumber: "100" }, { customerNumber: "200" }]);
    const importId = await admin.mutation(api.performance.onboarding.importStart, {
      kind: "prio",
      fileName: "prio.xlsx",
    });
    await admin.mutation(api.performance.onboarding.importPrioChunk, {
      importId,
      customerNumbers: ["100", "999"],
    });
    const done = await admin.mutation(api.performance.onboarding.importFinish, { importId });
    expect(done).toMatchObject({ prioHits: 1, missing: 1 });
    const cases = await admin.query(api.performance.onboarding.list, {});
    expect(cases.filter((c) => c.prio).map((c) => c.customerNumber)).toEqual(["100"]);
  });

  test("consultants see and work only their own cases once live", async () => {
    vi.stubEnv("ONBOARDING_MODE", "live");
    const { as, ids } = await setup();
    const admin = as("admin");
    await importReport(admin, [{ customerNumber: "100" }, { customerNumber: "200" }]);
    const all = await admin.query(api.performance.onboarding.list, {});
    await admin.mutation(api.performance.onboarding.assignMany, {
      caseIds: [all[0]._id],
      assigneeUserId: ids.melina,
    });

    const melina = as("melina");
    const own = await melina.query(api.performance.onboarding.list, {});
    expect(own.map((c) => c._id)).toEqual([all[0]._id]);
    await expect(
      melina.query(api.performance.onboarding.get, { caseId: all[1]._id }),
    ).rejects.toThrow();
    await expect(
      melina.mutation(api.performance.onboarding.update, {
        caseId: all[0]._id,
        assigneeUserId: ids.doreen,
      }),
    ).rejects.toThrow();
    await expect(
      melina.mutation(api.performance.onboarding.importStart, { kind: "report", fileName: "x" }),
    ).rejects.toThrow();

    await melina.mutation(api.performance.onboarding.addContact, {
      caseId: all[0]._id,
      kind: "not_reached",
      note: "Mailbox",
      nextFollowUp: "2026-10-30",
    });
    const detail = await melina.query(api.performance.onboarding.get, { caseId: all[0]._id });
    expect(detail.nextFollowUp).toBe("2026-10-30");
    expect(detail.contacts.map((c) => c.kind)).toEqual([
      "followUp",
      "status",
      "not_reached",
      "assign",
    ]);
    const listed = await melina.query(api.performance.onboarding.list, {});
    expect(listed[0]).toMatchObject({ contactAttempts: 1, lastContactKind: "not_reached" });
  });

  test("closing a case clears its follow-up", async () => {
    const { as } = await setup();
    const admin = as("admin");
    await importReport(admin, [{ customerNumber: "100" }]);
    const [c] = await admin.query(api.performance.onboarding.list, {});
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      nextFollowUp: "2026-11-01",
    });
    await admin.mutation(api.performance.onboarding.addContact, {
      caseId: c._id,
      kind: "reached",
      status: "done",
    });
    const detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({ status: "done", nextFollowUp: null });
    expect(detail.closedAt).not.toBeNull();
  });

  test("phases: first contact, milestones, cancel goes to winback", async () => {
    const { as } = await setup();
    const admin = as("admin");
    await importReport(admin, [{ customerNumber: "100" }, { customerNumber: "200" }]);
    const cases = await admin.query(api.performance.onboarding.list, {});
    const c = cases.find((x) => x.customerNumber === "100")!;
    expect(c).toMatchObject({ status: "fresh", outcomePath: [], milestones: [] });

    // A reason with children can't be picked on its own.
    await expect(
      admin.mutation(api.performance.onboarding.setOutcome, {
        caseId: c._id,
        path: ["case", "case.login"],
      }),
    ).rejects.toThrow();
    // Not reached: now "In Kontakt", situation kept.
    await admin.mutation(api.performance.onboarding.setOutcome, {
      caseId: c._id,
      path: ["notReached"],
      nextFollowUp: "2026-11-02",
      nextFollowUpTime: "09:15",
    });
    let detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({
      status: "step1",
      outcomePath: ["notReached"],
      nextFollowUp: "2026-11-02",
      nextFollowUpTime: "09:15",
    });
    expect(
      (await admin.query(api.performance.onboarding.list, {})).find((x) => x._id === c._id),
    ).toMatchObject({ lastContactKind: "not_reached", contactAttempts: 1 });

    // Cards ordered → phase 2; fuelled → phase 3; two-month check → done.
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      milestone: { key: "cards", done: true },
    });
    detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({ status: "step2", milestones: ["cards"] });
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      milestone: { key: "fuel", done: true },
    });
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      milestone: { key: "twoMonth", done: true },
    });
    detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({ status: "done", nextFollowUp: null });
    // Unticking the check reopens it.
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      milestone: { key: "twoMonth", done: false },
    });
    detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail.status).toBe("step3");

    // Will cancel with free text → winback, reason kept.
    const other = cases.find((x) => x.customerNumber === "200")!;
    await expect(
      admin.mutation(api.performance.onboarding.setOutcome, {
        caseId: other._id,
        path: ["cancel", "cancel.competition"],
      }),
    ).rejects.toThrow();
    await admin.mutation(api.performance.onboarding.setOutcome, {
      caseId: other._id,
      path: ["cancel", "cancel.competition"],
      text: "DKV günstiger",
    });
    let winback = await admin.query(api.performance.onboarding.get, { caseId: other._id });
    expect(winback).toMatchObject({
      status: "winback",
      outcomePath: ["cancel", "cancel.competition"],
      outcomeText: "DKV günstiger",
    });
    await expect(
      admin.mutation(api.performance.onboarding.setOutcome, {
        caseId: other._id,
        path: ["followUp"],
      }),
    ).rejects.toThrow();
    // Reopen: back to its phase.
    await admin.mutation(api.performance.onboarding.update, {
      caseId: other._id,
      status: "open",
    });
    winback = await admin.query(api.performance.onboarding.get, { caseId: other._id });
    expect(winback.status).toBe("step1");

    // Follow-up times only on the quarter hour.
    await expect(
      admin.mutation(api.performance.onboarding.update, {
        caseId: c._id,
        nextFollowUp: "2026-11-03",
        nextFollowUpTime: "09:20",
      }),
    ).rejects.toThrow();
  });

  test("admins extend the situation tree; new entries can be picked", async () => {
    const { as } = await setup();
    const admin = as("admin");
    const config = await admin.query(api.performance.onboarding.statusConfig, {});
    await admin.mutation(api.performance.onboarding.saveStatusConfig, {
      outcomes: [
        ...config.outcomes,
        { id: "callback", label: "Rückruf vom Kunden", kind: "followUp" as const },
      ],
    });
    await importReport(admin, [{ customerNumber: "100" }]);
    const [c] = await admin.query(api.performance.onboarding.list, {});
    await admin.mutation(api.performance.onboarding.setOutcome, {
      caseId: c._id,
      path: ["callback"],
    });
    // Deleting an entry is refused (hide instead).
    await expect(
      admin.mutation(api.performance.onboarding.saveStatusConfig, { outcomes: config.outcomes }),
    ).rejects.toThrow();
  });

  test("cases entered by hand: own for consultants, never missing from a report", async () => {
    vi.stubEnv("ONBOARDING_MODE", "live");
    const { as, ids } = await setup();
    const id = await as("doreen").mutation(api.performance.onboarding.create, {
      customerNumber: "0777",
      name: "Handkunde",
      closeDate: "2026-10-20",
      assigneeUserId: ids.melina,
    });
    const own = await as("doreen").query(api.performance.onboarding.list, {});
    expect(own.map((c) => c._id)).toEqual([id]);
    expect(own[0]).toMatchObject({ manual: true, closeDate: "2026-10-20" });
    await expect(
      as("admin").mutation(api.performance.onboarding.create, {
        customerNumber: "777",
        name: "Doppelt",
      }),
    ).rejects.toThrow();

    const done = await importReport(as("admin"), [{ customerNumber: "100" }]);
    expect(done.missing).toBe(0);
    const all = await as("admin").query(api.performance.onboarding.list, {});
    expect(all.find((c) => c._id === id)!.inReport).toBe(true);
  });

  test("follow-up with time: moving it keeps the time and is logged", async () => {
    const { as } = await setup();
    const admin = as("admin");
    await importReport(admin, [{ customerNumber: "100" }]);
    const [c] = await admin.query(api.performance.onboarding.list, {});
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      nextFollowUp: "2026-11-02",
      nextFollowUpTime: "09:15",
    });
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      nextFollowUp: "2026-11-04",
    });
    const detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({ nextFollowUp: "2026-11-04", nextFollowUpTime: "09:15" });
    expect(detail.contacts[0]).toMatchObject({
      kind: "followUp",
      fromValue: "2026-11-02 09:15",
      toValue: "2026-11-04 09:15",
    });
    await expect(
      admin.mutation(api.performance.onboarding.update, {
        caseId: c._id,
        nextFollowUpTime: "25:00",
      }),
    ).rejects.toThrow();
    // Clearing the date drops the time too.
    await admin.mutation(api.performance.onboarding.update, { caseId: c._id, nextFollowUp: null });
    const cleared = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(cleared).toMatchObject({ nextFollowUp: null, nextFollowUpTime: null });
  });

  test("distribution hands out unassigned open cases, prio first and in turns", async () => {
    const { as, ids } = await setup();
    const admin = as("admin");
    await importReport(
      admin,
      Array.from({ length: 6 }, (_, i) => ({ customerNumber: String(100 + i) })),
    );
    const cases = await admin.query(api.performance.onboarding.list, {});
    const prioCase = cases.find((c) => c.customerNumber === "105")!;
    await admin.mutation(api.performance.onboarding.update, { caseId: prioCase._id, prio: true });

    const result = await admin.mutation(api.performance.onboarding.distribute, {
      allocations: [
        { userId: ids.melina, count: 1 },
        { userId: ids.doreen, count: 10 },
      ],
    });
    expect(result.perUser).toEqual([
      { userId: ids.melina, count: 1 },
      { userId: ids.doreen, count: 5 },
    ]);
    const after = await admin.query(api.performance.onboarding.list, {});
    // The prio case went out first (to Melina, first in turn).
    expect(after.find((c) => c._id === prioCase._id)!.assigneeUserId).toBe(ids.melina);

    // Doreen is sick: move her new cases to Melina.
    const moved = await admin.mutation(api.performance.onboarding.reassign, {
      fromUserId: ids.doreen,
      toUserIds: [ids.melina],
      scope: "new",
      count: 2,
    });
    expect(moved.moved).toBe(2);
    const final = await admin.query(api.performance.onboarding.list, {});
    expect(final.filter((c) => c.assigneeUserId === ids.melina)).toHaveLength(3);

    // "Ansicht als": exactly Melina's list.
    const asMelina = await admin.query(api.performance.onboarding.list, { asUserId: ids.melina });
    expect(asMelina).toHaveLength(3);
  });

  test("team leads manage before go-live; only admins name leads", async () => {
    const { as, ids } = await setup();
    await as("admin").mutation(api.performance.onboarding.saveSettings, {
      memberUserIds: [ids.melina, ids.doreen],
      pausedUserIds: [],
      leadUserIds: [ids.doreen],
    });
    expect(await as("doreen").query(api.performance.onboarding.me, {})).toMatchObject({
      access: true,
      canManage: true,
      isAdmin: false,
    });
    expect(await as("melina").query(api.performance.onboarding.me, {})).toMatchObject({
      access: false,
    });
    await expect(
      as("doreen").mutation(api.performance.onboarding.saveSettings, {
        memberUserIds: [ids.melina],
        pausedUserIds: [],
        leadUserIds: [ids.melina],
      }),
    ).rejects.toThrow();
    await as("doreen").mutation(api.performance.onboarding.saveSettings, {
      memberUserIds: [ids.melina, ids.doreen],
      pausedUserIds: [ids.melina],
    });
    const settings = await as("admin").query(api.performance.onboarding.settings, {});
    expect(settings).toMatchObject({ leadUserIds: [ids.doreen], pausedUserIds: [ids.melina] });
    await expect(
      as("melina").query(api.performance.onboarding.list, { asUserId: ids.doreen }),
    ).rejects.toThrow();
  });
});
