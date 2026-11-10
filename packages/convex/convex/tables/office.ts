import { defineTable } from "convex/server";
import { v } from "convex/values";

export const officeItemKinds = [
  "computer",
  "laptop",
  "monitor",
  "dock",
  "keyboard",
  "mouse",
  "headset",
  "webcam",
  "phone",
  "cable",
  "adapter",
  "power",
  "network",
  "printer",
  "furniture",
  "other",
] as const;

export const officeItemKindValidator = v.union(...officeItemKinds.map((kind) => v.literal(kind)));

export const officeRoomValidator = v.object({
  id: v.string(),
  name: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
});

/** Plan coordinates are centimetres from the top-left corner of the office. */
export const officeTables = {
  /** Singleton: the office outline and its rooms. */
  officeLayout: defineTable({
    width: v.number(),
    height: v.number(),
    rooms: v.array(officeRoomValidator),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }),

  officeDesks: defineTable({
    name: v.string(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    userId: v.optional(v.id("users")),
    note: v.optional(v.string()),
    /** Last time someone went through this desk's equipment on site. */
    checkedAt: v.optional(v.number()),
    checkedBy: v.optional(v.id("users")),
    removedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_removedAt", ["removedAt"]),

  /** One piece of equipment, or a batch of identical small parts (`quantity`).
   *  No `deskId` = in the storage room. */
  officeItems: defineTable({
    kind: officeItemKindValidator,
    name: v.string(),
    /** Cables and adapters: what they connect and how long, e.g. "USB-C → HDMI, 2 m". */
    spec: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    inventoryNumber: v.optional(v.string()),
    quantity: v.number(),
    deskId: v.optional(v.id("officeDesks")),
    defective: v.optional(v.boolean()),
    note: v.optional(v.string()),
    /** Taken out of use (sold, broken beyond repair, thrown away). Kept for the record. */
    retiredAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_desk", ["deskId"])
    .index("by_retiredAt", ["retiredAt"]),

  officeItemLog: defineTable({
    itemId: v.id("officeItems"),
    action: v.union(
      v.literal("created"),
      v.literal("moved"),
      v.literal("updated"),
      v.literal("retired"),
      v.literal("restored"),
    ),
    fromDeskId: v.optional(v.id("officeDesks")),
    toDeskId: v.optional(v.id("officeDesks")),
    by: v.id("users"),
    at: v.number(),
  }).index("by_item", ["itemId", "at"]),
};
