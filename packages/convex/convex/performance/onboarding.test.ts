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
  statusFromSteps,
  stepsOf,
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

  test("stage follows from the three steps", () => {
    expect(statusFromSteps({ cards: false, fuel: false, twoMonth: false })).toBe("fresh");
    expect(statusFromSteps({ cards: true, fuel: false, twoMonth: false })).toBe("step1");
    expect(statusFromSteps({ cards: true, fuel: true, twoMonth: false })).toBe("step2");
    expect(statusFromSteps({ cards: true, fuel: true, twoMonth: true })).toBe("done");
    // Rows from before the steps existed: implied by the stage.
    expect(stepsOf({ status: "step2" })).toEqual({ cards: true, fuel: true, twoMonth: false });
    expect(stepsOf({ status: "step2", cardsOrderedAt: 1 })).toEqual({
      cards: true,
      fuel: false,
      twoMonth: false,
    });
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
      status: "step2",
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
    expect(detail.contacts.map((c) => c.kind)).toEqual(["followUp", "not_reached", "assign"]);
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
  });

  test("ticking steps moves the stage; all three close the case", async () => {
    const { as } = await setup();
    const admin = as("admin");
    await importReport(admin, [{ customerNumber: "100", reportStatus: "Progress Step 1" }]);
    const [c] = await admin.query(api.performance.onboarding.list, {});
    expect(c.steps).toEqual({ cards: true, fuel: false, twoMonth: false });

    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      nextFollowUp: "2026-11-01",
      steps: { fuel: true },
    });
    let detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({ status: "step2", nextFollowUp: "2026-11-01" });

    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      steps: { twoMonth: true },
      subStatus: " 2M ",
      note: "Rückruf nach Kartenlieferung",
    });
    detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({
      status: "done",
      nextFollowUp: null,
      subStatus: "2M",
      note: "Rückruf nach Kartenlieferung",
    });
    expect(detail.contacts.filter((x) => x.kind === "step").map((x) => x.fromValue)).toEqual([
      "twoMonth",
      "fuel",
    ]);

    // Un-ticking reopens it.
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      steps: { twoMonth: false },
    });
    detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail.status).toBe("step2");
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
      nextFollowUpTime: "09:30",
    });
    await admin.mutation(api.performance.onboarding.update, {
      caseId: c._id,
      nextFollowUp: "2026-11-04",
    });
    const detail = await admin.query(api.performance.onboarding.get, { caseId: c._id });
    expect(detail).toMatchObject({ nextFollowUp: "2026-11-04", nextFollowUpTime: "09:30" });
    expect(detail.contacts[0]).toMatchObject({
      kind: "followUp",
      fromValue: "2026-11-02 09:30",
      toValue: "2026-11-04 09:30",
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
});
