import { defineTable } from "convex/server";
import { v } from "convex/values";

export const vaultCategories = [
  "microsoft",
  "google",
  "ionos",
  "salesforce",
  "hosting",
  "devices",
  "other",
] as const;

export const vaultCategoryValidator = v.union(...vaultCategories.map((c) => v.literal(c)));

export const vaultTables = {
  /** Zugänge (Organisation → Zugänge): shared logins IT keeps for the company.
   * Password and notes are AES-256-GCM ciphertext made by apps/api with
   * `VAULT_ENC_KEY`; Convex never sees them in plain text. Admins only. */
  vaultEntries: defineTable({
    title: v.string(),
    category: vaultCategoryValidator,
    username: v.optional(v.string()),
    url: v.optional(v.string()),
    passwordEnc: v.string(),
    notesEnc: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
    passwordChangedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_title", ["title"])
    .index("by_deletedAt", ["deletedAt"]),

  /** Who saw, copied or changed which entry — never the value itself. */
  vaultAccessLog: defineTable({
    entryId: v.id("vaultEntries"),
    userId: v.id("users"),
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("password_changed"),
      v.literal("revealed"),
      v.literal("deleted"),
    ),
    at: v.number(),
  }).index("by_entry", ["entryId", "at"]),
};
