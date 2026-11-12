import { describe, expect, test } from "vitest";

import { actionsByCustomerMonth, cohortFunnel, type MirrorCase, tempo } from "./onboardingMirror";

const mk = (id: string, closeDate: string, extra: Partial<MirrorCase> = {}): MirrorCase => ({
  id,
  closeDate,
  status: "step1",
  closed: false,
  archived: false,
  milestones: new Set(),
  contactAttempts: 0,
  itOpen: false,
  closedAt: null,
  cardsAt: null,
  fuelAt: null,
  twoMonthAt: null,
  ...extra,
});
const at = (day: string) => Date.parse(`${day}T10:00:00Z`);
const berlin = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ev = (caseId: string, day: string, kind: string, extra: Record<string, string> = {}) => ({
  caseId,
  kind,
  byUserId: "u",
  day,
  at: at(day),
  ...extra,
});

describe("Kunden-Spiegel", () => {
  test("actions by the customer's close month", () => {
    const months = new Map([
      ["a", "2026-11"],
      ["b", "2026-10"],
      ["c", "2026-08"],
    ]);
    const r = actionsByCustomerMonth(
      [
        ev("a", "2026-11-03", "milestone", { fromValue: "cards", toValue: "1" }),
        ev("b", "2026-11-03", "milestone", { fromValue: "cards", toValue: "1" }),
        ev("c", "2026-11-03", "milestone", { fromValue: "cards", toValue: "1" }),
        ev("x", "2026-11-03", "reached"),
      ],
      (id) => months.get(id) ?? null,
      "2026-11",
    );
    expect(r.cards).toEqual({ same: 1, prev: 1, older: 1, unknown: 0 });
    expect(r.reached.unknown).toBe(1);
    expect(r.attempts.unknown).toBe(1);
  });

  test("funnel and days from Close Won", () => {
    const cases = [
      mk("a", "2026-11-02", { milestones: new Set(["cards"]), contactAttempts: 2 }),
      mk("b", "2026-11-02", { contactAttempts: 1 }),
      mk("c", "2026-11-03"),
    ];
    const log = new Map([
      [
        "a",
        [
          ev("a", "2026-11-02", "not_reached"),
          ev("a", "2026-11-04", "reached"),
          ev("a", "2026-11-06", "milestone", { fromValue: "cards", toValue: "1" }),
        ],
      ],
      ["b", [ev("b", "2026-11-03", "not_reached")]],
    ]);
    expect(cohortFunnel(cases, log)).toMatchObject({
      total: 3,
      contacted: 2,
      reached: 1,
      cards: 1,
    });
    const t = tempo(cases, log, berlin);
    expect(t.steps.contact).toEqual({ median: 0.5, n: 2 });
    expect(t.steps.reached).toEqual({ median: 2, n: 1 });
    expect(t.steps.cards).toEqual({ median: 4, n: 1 });
    expect(t.contactBuckets).toMatchObject({ "0": 1, "1-2": 1 });
    expect(t.within2Share).toBe(100);
  });
});
