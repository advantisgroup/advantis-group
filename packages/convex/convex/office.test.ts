import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  for (const [key, role] of [
    ["ada", "admin"],
    ["ben", "employee"],
  ] as const) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkUserId: key,
        email: `${key}@advantisgroup.de`,
        firstName: key,
        role,
        status: "active",
        external: false,
        createdAt: Date.now(),
      }),
    );
  }
  return {
    t,
    ada: t.withIdentity({ subject: "ada" }),
    ben: t.withIdentity({ subject: "ben" }),
  };
}

describe("office", () => {
  test("only admins until OFFICE_MODE is live, and only admins change things", async () => {
    const { ada, ben } = await setup();
    expect(await ben.query(api.office.me, {})).toMatchObject({ access: false, canEdit: false });
    await expect(ben.query(api.office.plan, {})).rejects.toThrow();
    await ada.mutation(api.office.createDesk, { name: "P1", x: 0, y: 0, w: 160, h: 80 });

    vi.stubEnv("OFFICE_MODE", "live");
    expect((await ben.query(api.office.plan, {})).desks).toHaveLength(1);
    await expect(
      ben.mutation(api.office.createDesk, { name: "P2", x: 0, y: 0, w: 160, h: 80 }),
    ).rejects.toThrow();
  });

  test("taking part of a batch out of storage splits it", async () => {
    const { ada } = await setup();
    const deskId = await ada.mutation(api.office.createDesk, {
      name: "P1",
      x: 100,
      y: 100,
      w: 160,
      h: 80,
    });
    const boxId = await ada.mutation(api.office.createItem, {
      kind: "cable",
      name: "HDMI",
      quantity: 10,
    });
    const movedId = await ada.mutation(api.office.moveItem, { itemId: boxId, deskId, quantity: 2 });

    const storage = await ada.query(api.office.items, { scope: "storage" });
    expect(storage.map((item) => item.quantity)).toEqual([8]);
    const desk = await ada.query(api.office.desk, { deskId });
    expect(desk?.items.map((item) => [item._id, item.quantity])).toEqual([[movedId, 2]]);
    expect((await ada.query(api.office.plan, {})).inStorage).toBe(8);
  });

  test("removing a desk sends its equipment to storage", async () => {
    const { ada } = await setup();
    const deskId = await ada.mutation(api.office.createDesk, {
      name: "P1",
      x: 0,
      y: 0,
      w: 160,
      h: 80,
    });
    const itemId = await ada.mutation(api.office.createItem, {
      kind: "monitor",
      name: "Dell P2422H",
      quantity: 1,
      deskId,
    });
    await ada.mutation(api.office.removeDesk, { deskId });

    expect((await ada.query(api.office.plan, {})).desks).toHaveLength(0);
    const storage = await ada.query(api.office.items, { scope: "storage" });
    expect(storage.map((item) => item._id)).toEqual([itemId]);
    const history = await ada.query(api.office.itemHistory, { itemId });
    expect(history.map((row) => [row.action, row.from])).toEqual([
      ["moved", "P1"],
      ["created", null],
    ]);
  });

  test("importing an inventory list writes all rows or none", async () => {
    const { ada, ben } = await setup();
    const deskId = await ada.mutation(api.office.createDesk, {
      name: "P1",
      x: 0,
      y: 0,
      w: 160,
      h: 80,
    });
    const rows = [
      { kind: "cable" as const, name: "VGA-Kabel", quantity: 8 },
      { kind: "monitor" as const, name: "iiyama ProLite XB2491H", quantity: 1, deskId },
    ];
    await expect(ben.mutation(api.office.importItems, { items: rows })).rejects.toThrow();
    // One bad row stops the whole import.
    await expect(
      ada.mutation(api.office.importItems, { items: [...rows, { ...rows[0], quantity: 0 }] }),
    ).rejects.toThrow();
    expect(await ada.query(api.office.items, { scope: "all" })).toHaveLength(0);

    expect(await ada.mutation(api.office.importItems, { items: rows })).toBe(2);
    const storage = await ada.query(api.office.items, { scope: "storage" });
    expect(storage.map((item) => [item.name, item.quantity])).toEqual([["VGA-Kabel", 8]]);
    const desk = await ada.query(api.office.desk, { deskId });
    expect(desk?.items.map((item) => item.name)).toEqual(["iiyama ProLite XB2491H"]);
  });

  test("walls and doors are stored with the plan and must stay on it", async () => {
    const { ada } = await setup();
    const wall = { id: "w1", kind: "wall" as const, x1: 0, y1: 500, x2: 600, y2: 500 };
    const door = { id: "d1", kind: "door" as const, x1: 600, y1: 500, x2: 690, y2: 500 };
    await ada.mutation(api.office.saveLayout, {
      width: 1200,
      height: 3000,
      rooms: [],
      lines: [wall, door],
    });
    expect((await ada.query(api.office.plan, {})).layout.lines).toEqual([wall, door]);
    await expect(
      ada.mutation(api.office.saveLayout, {
        width: 1200,
        height: 3000,
        rooms: [],
        lines: [{ ...wall, x2: 1300 }],
      }),
    ).rejects.toThrow();
  });

  test("rooms keep open sides, blocked areas and moved names; free labels are stored", async () => {
    const { ada } = await setup();
    const kitchen = {
      id: "k",
      name: "Küche",
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      open: ["bottom" as const],
    };
    const corner = { id: "c", name: "", x: 1100, y: 0, w: 100, h: 100, blocked: true };
    const office = {
      id: "o",
      name: "Büro",
      x: 0,
      y: 400,
      w: 400,
      h: 300,
      labelX: 150,
      labelY: 550,
    };
    const label = { id: "l", text: "Empfang", x: 600, y: 1500 };
    await ada.mutation(api.office.saveLayout, {
      width: 1200,
      height: 3000,
      rooms: [kitchen, corner, office],
      labels: [label],
    });
    const { layout } = await ada.query(api.office.plan, {});
    expect(layout.rooms).toEqual([kitchen, corner, office]);
    expect(layout.labels).toEqual([label]);
  });
});
