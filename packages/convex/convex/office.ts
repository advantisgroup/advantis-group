import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { serverUserQuery, userMutation, userQuery } from "./functions";
import { type Caller } from "./lib/caller";
import {
  officeItemKindValidator,
  officeLabelValidator,
  officeLineValidator,
  officeRoomValidator,
} from "./tables/office";
import { displayName } from "./time/lib/store";

/**
 * Office: the floor plan with its desks, what is plugged in at each desk, and
 * the storage room. Admins keep it up to date; everyone else may look once
 * the Convex env var `OFFICE_MODE` is `live`.
 */

type DeskId = Id<"officeDesks">;

// The office (Vahan, 10.11.2026): 12 m wide, 30 m long, drawn upright.
const DEFAULT_LAYOUT = { width: 1200, height: 3000, rooms: [], lines: [], labels: [] };
const MIN_SIZE = 20;
const MAX_PLAN = 10_000;

const officeLive = () => process.env.OFFICE_MODE === "live";
const canSee = (caller: Caller) => caller.isAdmin || officeLive();

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireSee(caller: Caller) {
  if (!canSee(caller)) fail("forbidden", "Office is not open yet");
}

function cleanText(value: string | undefined, max = 200) {
  const text = value?.trim().slice(0, max);
  return text ? text : undefined;
}

function requireName(value: string) {
  const name = cleanText(value, 80);
  if (!name) fail("bad_request", "Name is required");
  return name;
}

function checkBox(box: { x: number; y: number; w: number; h: number }) {
  const ok =
    [box.x, box.y, box.w, box.h].every(Number.isFinite) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.w >= MIN_SIZE &&
    box.h >= MIN_SIZE &&
    box.x + box.w <= MAX_PLAN &&
    box.y + box.h <= MAX_PLAN;
  if (!ok) fail("bad_request", "Position outside the plan");
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.w),
    h: Math.round(box.h),
  };
}

async function nameOf(ctx: QueryCtx, userId: Id<"users"> | undefined) {
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user ? displayName(user) : null;
}

async function liveDesk(ctx: QueryCtx, deskId: DeskId) {
  const desk = await ctx.db.get(deskId);
  if (!desk || desk.removedAt) fail("not_found", "Desk not found");
  return desk;
}

async function liveItem(ctx: QueryCtx, itemId: Id<"officeItems">) {
  const item = await ctx.db.get(itemId);
  if (!item) fail("not_found", "Item not found");
  return item;
}

function activeItems(ctx: QueryCtx, deskId: DeskId) {
  return ctx.db
    .query("officeItems")
    .withIndex("by_desk", (q) => q.eq("deskId", deskId))
    .collect()
    .then((rows) => rows.filter((row) => !row.retiredAt));
}

async function log(
  ctx: MutationCtx,
  caller: Caller,
  itemId: Id<"officeItems">,
  action: Doc<"officeItemLog">["action"],
  move?: { from?: DeskId; to?: DeskId },
) {
  await ctx.db.insert("officeItemLog", {
    itemId,
    action,
    fromDeskId: move?.from,
    toDeskId: move?.to,
    by: caller.user._id,
    at: Date.now(),
  });
}

export const me = userQuery({
  args: {},
  handler: async (ctx) => ({
    access: canSee(ctx.caller),
    live: officeLive(),
    canEdit: ctx.caller.isAdmin,
  }),
});

/** For the API's photo recognition: only admins record equipment. */
export const apiCanRecord = serverUserQuery({
  role: "admin",
  args: {},
  handler: async () => true,
});

/** The floor plan with every desk and how much is set up there. */
export const plan = userQuery({
  args: {},
  handler: async (ctx) => {
    requireSee(ctx.caller);
    const [layout, desks, items, users] = await Promise.all([
      ctx.db.query("officeLayout").first(),
      ctx.db
        .query("officeDesks")
        .withIndex("by_removedAt", (q) => q.eq("removedAt", undefined))
        .collect(),
      ctx.db
        .query("officeItems")
        .withIndex("by_retiredAt", (q) => q.eq("retiredAt", undefined))
        .collect(),
      ctx.db.query("users").collect(),
    ]);
    const names = new Map(users.map((user) => [user._id, displayName(user)]));
    const counts = new Map<DeskId, { items: number; defective: number }>();
    let inStorage = 0;
    for (const item of items) {
      if (!item.deskId) {
        inStorage += item.quantity;
        continue;
      }
      const count = counts.get(item.deskId) ?? { items: 0, defective: 0 };
      count.items += item.quantity;
      if (item.defective) count.defective += 1;
      counts.set(item.deskId, count);
    }
    return {
      layout: layout
        ? {
            width: layout.width,
            height: layout.height,
            rooms: layout.rooms,
            lines: layout.lines ?? [],
            labels: layout.labels ?? [],
          }
        : DEFAULT_LAYOUT,
      desks: desks
        .map((desk) => ({
          _id: desk._id,
          name: desk.name,
          x: desk.x,
          y: desk.y,
          w: desk.w,
          h: desk.h,
          userId: desk.userId ?? null,
          userName: desk.userId ? (names.get(desk.userId) ?? null) : null,
          checkedAt: desk.checkedAt ?? null,
          items: counts.get(desk._id)?.items ?? 0,
          defective: counts.get(desk._id)?.defective ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true })),
      inStorage,
      people: ctx.caller.isAdmin
        ? users
            .filter((user) => user.status === "active")
            .map((user) => ({ userId: user._id, name: displayName(user) }))
            .sort((a, b) => a.name.localeCompare(b.name, "de"))
        : [],
    };
  },
});

export const desk = userQuery({
  args: { deskId: v.id("officeDesks") },
  handler: async (ctx, { deskId }) => {
    requireSee(ctx.caller);
    const desk = await ctx.db.get(deskId);
    if (!desk || desk.removedAt) return null;
    const [items, userName, checkedByName] = await Promise.all([
      activeItems(ctx, deskId),
      nameOf(ctx, desk.userId),
      nameOf(ctx, desk.checkedBy),
    ]);
    return {
      _id: desk._id,
      name: desk.name,
      userId: desk.userId ?? null,
      userName,
      note: desk.note ?? null,
      checkedAt: desk.checkedAt ?? null,
      checkedByName,
      items: items.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    };
  },
});

/** Equipment lists: what's in storage, everything in use, or what was retired. */
export const items = userQuery({
  args: { scope: v.union(v.literal("storage"), v.literal("all"), v.literal("retired")) },
  handler: async (ctx, { scope }) => {
    requireSee(ctx.caller);
    const [rows, desks] = await Promise.all([
      scope === "retired"
        ? ctx.db
            .query("officeItems")
            .withIndex("by_retiredAt", (q) => q.gt("retiredAt", 0))
            .collect()
        : ctx.db
            .query("officeItems")
            .withIndex("by_retiredAt", (q) => q.eq("retiredAt", undefined))
            .collect(),
      ctx.db.query("officeDesks").collect(),
    ]);
    const deskNames = new Map(desks.map((desk) => [desk._id, desk.name]));
    return rows
      .filter((row) => scope !== "storage" || !row.deskId)
      .map((row) => ({ ...row, deskName: row.deskId ? (deskNames.get(row.deskId) ?? null) : null }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "de"));
  },
});

export const itemHistory = userQuery({
  args: { itemId: v.id("officeItems") },
  handler: async (ctx, { itemId }) => {
    requireSee(ctx.caller);
    const [rows, desks] = await Promise.all([
      ctx.db
        .query("officeItemLog")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .order("desc")
        .take(50),
      ctx.db.query("officeDesks").collect(),
    ]);
    const deskNames = new Map(desks.map((desk) => [desk._id, desk.name]));
    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        action: row.action,
        at: row.at,
        byName: await nameOf(ctx, row.by),
        from: row.fromDeskId ? (deskNames.get(row.fromDeskId) ?? null) : null,
        to: row.toDeskId ? (deskNames.get(row.toDeskId) ?? null) : null,
      })),
    );
  },
});

// --- Plan (admins) ----------------------------------------------------------

export const saveLayout = userMutation({
  role: "admin",
  args: {
    width: v.number(),
    height: v.number(),
    rooms: v.array(officeRoomValidator),
    lines: v.optional(v.array(officeLineValidator)),
    labels: v.optional(v.array(officeLabelValidator)),
  },
  handler: async (ctx, { width, height, rooms, lines, labels }) => {
    const size = checkBox({ x: 0, y: 0, w: width, h: height });
    const inside = (x: number, y: number) =>
      Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= size.w && y <= size.h;
    const cleanRooms = rooms.map((room) => {
      const label =
        room.labelX !== undefined && room.labelY !== undefined
          ? { labelX: Math.round(room.labelX), labelY: Math.round(room.labelY) }
          : null;
      if (label && !inside(label.labelX, label.labelY))
        fail("bad_request", "Label outside the plan");
      return {
        id: room.id.slice(0, 40),
        name: cleanText(room.name, 60) ?? "",
        ...checkBox(room),
        ...(room.open?.length ? { open: [...new Set(room.open)] } : {}),
        ...(room.blocked ? { blocked: true } : {}),
        ...label,
      };
    });
    const cleanLabels = (labels ?? []).map((label) => {
      if (!inside(label.x, label.y)) fail("bad_request", "Label outside the plan");
      return {
        id: label.id.slice(0, 40),
        text: cleanText(label.text, 60) ?? "",
        x: Math.round(label.x),
        y: Math.round(label.y),
      };
    });
    const cleanLines = (lines ?? []).map((line) => {
      if (!inside(line.x1, line.y1) || !inside(line.x2, line.y2)) {
        fail("bad_request", "Line outside the plan");
      }
      return {
        id: line.id.slice(0, 40),
        kind: line.kind,
        x1: Math.round(line.x1),
        y1: Math.round(line.y1),
        x2: Math.round(line.x2),
        y2: Math.round(line.y2),
      };
    });
    const row = {
      width: size.w,
      height: size.h,
      rooms: cleanRooms,
      lines: cleanLines,
      labels: cleanLabels,
      updatedBy: ctx.caller.user._id,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db.query("officeLayout").first();
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("officeLayout", row);
  },
});

const boxArgs = { x: v.number(), y: v.number(), w: v.number(), h: v.number() };

export const createDesk = userMutation({
  role: "admin",
  args: { name: v.string(), ...boxArgs },
  handler: async (ctx, { name, ...box }) => {
    const now = Date.now();
    return ctx.db.insert("officeDesks", {
      name: requireName(name),
      ...checkBox(box),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDesk = userMutation({
  role: "admin",
  args: {
    deskId: v.id("officeDesks"),
    name: v.optional(v.string()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    userId: v.optional(v.union(v.id("users"), v.null())),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { deskId, name, userId, note, ...box }) => {
    const desk = await liveDesk(ctx, deskId);
    if (userId) {
      const user = await ctx.db.get(userId);
      if (!user || user.status !== "active") fail("bad_request", "Unknown person");
    }
    await ctx.db.patch(deskId, {
      ...(name !== undefined && { name: requireName(name) }),
      ...(Object.values(box).some((value) => value !== undefined) &&
        checkBox({
          x: box.x ?? desk.x,
          y: box.y ?? desk.y,
          w: box.w ?? desk.w,
          h: box.h ?? desk.h,
        })),
      ...(userId !== undefined && { userId: userId ?? undefined }),
      ...(note !== undefined && { note: cleanText(note, 1000) }),
      updatedAt: Date.now(),
    });
  },
});

/** Takes a desk off the plan; whatever was set up there goes to storage. */
export const removeDesk = userMutation({
  role: "admin",
  args: { deskId: v.id("officeDesks") },
  handler: async (ctx, { deskId }) => {
    await liveDesk(ctx, deskId);
    const now = Date.now();
    for (const item of await activeItems(ctx, deskId)) {
      await ctx.db.patch(item._id, { deskId: undefined, updatedAt: now });
      await log(ctx, ctx.caller, item._id, "moved", { from: deskId });
    }
    await ctx.db.patch(deskId, { removedAt: now, updatedAt: now });
  },
});

export const markChecked = userMutation({
  role: "admin",
  args: { deskId: v.id("officeDesks") },
  handler: async (ctx, { deskId }) => {
    await liveDesk(ctx, deskId);
    const now = Date.now();
    await ctx.db.patch(deskId, { checkedAt: now, checkedBy: ctx.caller.user._id, updatedAt: now });
  },
});

// --- Equipment (admins) -----------------------------------------------------

const itemFields = {
  kind: officeItemKindValidator,
  name: v.string(),
  spec: v.optional(v.string()),
  serialNumber: v.optional(v.string()),
  inventoryNumber: v.optional(v.string()),
  quantity: v.number(),
  defective: v.optional(v.boolean()),
  note: v.optional(v.string()),
};

function cleanItem(fields: {
  kind: Doc<"officeItems">["kind"];
  name: string;
  spec?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  quantity: number;
  defective?: boolean;
  note?: string;
}) {
  if (!Number.isInteger(fields.quantity) || fields.quantity < 1 || fields.quantity > 9999) {
    fail("bad_request", "Quantity must be a whole number from 1");
  }
  return {
    kind: fields.kind,
    name: requireName(fields.name),
    spec: cleanText(fields.spec),
    serialNumber: cleanText(fields.serialNumber, 80),
    inventoryNumber: cleanText(fields.inventoryNumber, 80),
    quantity: fields.quantity,
    defective: fields.defective || undefined,
    note: cleanText(fields.note, 1000),
  };
}

export const createItem = userMutation({
  role: "admin",
  args: { ...itemFields, deskId: v.optional(v.id("officeDesks")) },
  handler: async (ctx, { deskId, ...fields }) => {
    if (deskId) await liveDesk(ctx, deskId);
    const now = Date.now();
    const itemId = await ctx.db.insert("officeItems", {
      ...cleanItem(fields),
      deskId,
      createdBy: ctx.caller.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await log(ctx, ctx.caller, itemId, "created", { to: deskId });
    return itemId;
  },
});

const MAX_IMPORT = 300;

/**
 * Bulk import from an inventory list (one round through the office): all
 * rows in one go, each into storage or onto its desk. Nothing is merged with
 * what's already recorded — the dialog warns before importing twice.
 */
export const importItems = userMutation({
  role: "admin",
  args: {
    items: v.array(v.object({ ...itemFields, deskId: v.optional(v.id("officeDesks")) })),
  },
  handler: async (ctx, { items }) => {
    if (items.length === 0) return 0;
    if (items.length > MAX_IMPORT) fail("bad_request", `At most ${MAX_IMPORT} rows at once`);
    const desks = [...new Set(items.flatMap((item) => (item.deskId ? [item.deskId] : [])))];
    for (const deskId of desks) await liveDesk(ctx, deskId);
    // Validate everything before writing anything.
    const rows = items.map(({ deskId, ...fields }) => ({ deskId, ...cleanItem(fields) }));
    const now = Date.now();
    for (const row of rows) {
      const itemId = await ctx.db.insert("officeItems", {
        ...row,
        createdBy: ctx.caller.user._id,
        createdAt: now,
        updatedAt: now,
      });
      await log(ctx, ctx.caller, itemId, "created", { to: row.deskId });
    }
    return rows.length;
  },
});

export const updateItem = userMutation({
  role: "admin",
  args: { itemId: v.id("officeItems"), ...itemFields },
  handler: async (ctx, { itemId, ...fields }) => {
    const item = await liveItem(ctx, itemId);
    const { _id, _creationTime, ...rest } = item;
    await ctx.db.replace(itemId, {
      ...rest,
      ...cleanItem(fields),
      updatedAt: Date.now(),
    });
    await log(ctx, ctx.caller, itemId, "updated");
  },
});

/**
 * Moves an item to a desk or to storage (`deskId: null`). For a batch of
 * identical parts, `quantity` below the batch size splits off just that many
 * — taking two HDMI cables out of a box of ten.
 */
export const moveItem = userMutation({
  role: "admin",
  args: {
    itemId: v.id("officeItems"),
    deskId: v.union(v.id("officeDesks"), v.null()),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, { itemId, deskId, quantity }) => {
    const item = await liveItem(ctx, itemId);
    if (item.retiredAt) fail("bad_request", "Item is retired");
    if (deskId) await liveDesk(ctx, deskId);
    const to = deskId ?? undefined;
    if (item.deskId === to) return itemId;
    const now = Date.now();
    const count = quantity ?? item.quantity;
    if (!Number.isInteger(count) || count < 1 || count > item.quantity) {
      fail("bad_request", "Invalid quantity");
    }
    if (count === item.quantity) {
      await ctx.db.patch(itemId, { deskId: to, updatedAt: now });
      await log(ctx, ctx.caller, itemId, "moved", { from: item.deskId, to });
      return itemId;
    }
    await ctx.db.patch(itemId, { quantity: item.quantity - count, updatedAt: now });
    const { _id, _creationTime, ...rest } = item;
    const splitId = await ctx.db.insert("officeItems", {
      ...rest,
      quantity: count,
      deskId: to,
      createdBy: ctx.caller.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await log(ctx, ctx.caller, splitId, "moved", { from: item.deskId, to });
    return splitId;
  },
});

export const retireItem = userMutation({
  role: "admin",
  args: { itemId: v.id("officeItems") },
  handler: async (ctx, { itemId }) => {
    const item = await liveItem(ctx, itemId);
    if (item.retiredAt) return;
    const now = Date.now();
    await ctx.db.patch(itemId, { retiredAt: now, deskId: undefined, updatedAt: now });
    await log(ctx, ctx.caller, itemId, "retired", { from: item.deskId });
  },
});

/** Brings a retired item back, into storage. */
export const restoreItem = userMutation({
  role: "admin",
  args: { itemId: v.id("officeItems") },
  handler: async (ctx, { itemId }) => {
    const item = await liveItem(ctx, itemId);
    if (!item.retiredAt) return;
    await ctx.db.patch(itemId, { retiredAt: undefined, updatedAt: Date.now() });
    await log(ctx, ctx.caller, itemId, "restored");
  },
});
