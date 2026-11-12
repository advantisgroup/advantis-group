import { defineTable } from "convex/server";
import { v } from "convex/values";

export const keyTables = {
  /** Schlüssel (Organisation → Schlüssel): every physical key and who has it
   * right now. One row per key, so two copies of the front-door key are two
   * rows. Admins only. */
  officeKeys: defineTable({
    label: v.string(),
    /** The number stamped on the key or its tag, if any. */
    number: v.optional(v.string()),
    /** Which door, cabinet or area it opens. */
    opens: v.optional(v.string()),
    note: v.optional(v.string()),
    holderUserId: v.optional(v.id("users")),
    issuedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_label", ["label"])
    .index("by_holder", ["holderUserId"])
    .index("by_deletedAt", ["deletedAt"]),

  /** Hand-overs and changes, newest first per key. */
  officeKeyEvents: defineTable({
    keyId: v.id("officeKeys"),
    action: v.union(
      v.literal("created"),
      v.literal("edited"),
      v.literal("issued"),
      v.literal("returned"),
      v.literal("deleted"),
    ),
    /** For issued/returned: the person who got or gave back the key. */
    holderUserId: v.optional(v.id("users")),
    byUserId: v.id("users"),
    at: v.number(),
  }).index("by_key", ["keyId", "at"]),
};
