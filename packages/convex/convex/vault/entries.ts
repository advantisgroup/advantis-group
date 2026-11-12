import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { serverUserMutation, userMutation, userQuery } from "../functions";
import { moveToTrash } from "../lib/trash";
import { displayName } from "../lib/users";
import { vaultCategoryValidator } from "../tables/vault";

/**
 * Zugänge: shared company logins (Microsoft, IONOS, Salesforce …), admins only.
 * Plain text only ever exists in apps/api (routes/vault.ts), which encrypts
 * before calling `apiCreate`/`apiUpdate` and decrypts what `apiReveal` hands
 * back. Every reveal and change is written to `vaultAccessLog`.
 */

type Action = "created" | "updated" | "password_changed" | "revealed" | "deleted";

function log(
  ctx: Pick<MutationCtx, "db">,
  entryId: Id<"vaultEntries">,
  userId: Id<"users">,
  action: Action,
) {
  return ctx.db.insert("vaultAccessLog", { entryId, userId, action, at: Date.now() });
}

const clean = (value: string | undefined, max: number) => {
  const trimmed = value?.trim().slice(0, max);
  return trimmed ? trimmed : undefined;
};

/** The list, without any ciphertext. */
export const list = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("vaultEntries").withIndex("by_title").collect();
    const names = new Map<Id<"users">, string>();
    for (const entry of entries) {
      if (!names.has(entry.updatedBy)) {
        names.set(entry.updatedBy, displayName(await ctx.db.get(entry.updatedBy)));
      }
    }
    return entries.map((entry) => ({
      id: entry._id,
      title: entry.title,
      category: entry.category,
      username: entry.username ?? null,
      url: entry.url ?? null,
      hasNotes: entry.notesEnc !== undefined,
      updatedAt: entry.updatedAt,
      updatedByName: names.get(entry.updatedBy) ?? null,
      passwordChangedAt: entry.passwordChangedAt,
    }));
  },
});

export const history = userQuery({
  role: "admin",
  args: { entryId: v.id("vaultEntries") },
  handler: async (ctx, { entryId }) => {
    const rows = await ctx.db
      .query("vaultAccessLog")
      .withIndex("by_entry", (q) => q.eq("entryId", entryId))
      .order("desc")
      .take(30);
    const names = new Map<Id<"users">, string>();
    for (const row of rows) {
      if (!names.has(row.userId)) names.set(row.userId, displayName(await ctx.db.get(row.userId)));
    }
    return rows.map((row) => ({
      id: row._id,
      action: row.action,
      at: row.at,
      name: names.get(row.userId) ?? null,
    }));
  },
});

const fields = {
  title: v.string(),
  category: vaultCategoryValidator,
  username: v.optional(v.string()),
  url: v.optional(v.string()),
};

export const apiCreate = serverUserMutation({
  role: "admin",
  args: { ...fields, passwordEnc: v.string(), notesEnc: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const title = clean(args.title, 120);
    if (!title) throw new ConvexError({ code: "validation", message: "Titel fehlt." });
    const now = Date.now();
    const id = await ctx.db.insert("vaultEntries", {
      title,
      category: args.category,
      username: clean(args.username, 200),
      url: clean(args.url, 500),
      passwordEnc: args.passwordEnc,
      notesEnc: args.notesEnc,
      createdBy: ctx.caller.id,
      createdAt: now,
      updatedBy: ctx.caller.id,
      updatedAt: now,
      passwordChangedAt: now,
    });
    await log(ctx, id, ctx.caller.id, "created");
    return id;
  },
});

/** `passwordEnc` only when the password itself changed; `notesEnc: ""` clears the notes. */
export const apiUpdate = serverUserMutation({
  role: "admin",
  args: {
    entryId: v.id("vaultEntries"),
    ...fields,
    passwordEnc: v.optional(v.string()),
    notesEnc: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new ConvexError({ code: "not_found", message: "Zugang nicht gefunden." });
    const title = clean(args.title, 120);
    if (!title) throw new ConvexError({ code: "validation", message: "Titel fehlt." });
    const now = Date.now();
    await ctx.db.patch(entry._id, {
      title,
      category: args.category,
      username: clean(args.username, 200),
      url: clean(args.url, 500),
      notesEnc: args.notesEnc === "" ? undefined : (args.notesEnc ?? entry.notesEnc),
      ...(args.passwordEnc ? { passwordEnc: args.passwordEnc, passwordChangedAt: now } : {}),
      updatedBy: ctx.caller.id,
      updatedAt: now,
    });
    await log(ctx, entry._id, ctx.caller.id, args.passwordEnc ? "password_changed" : "updated");
  },
});

/** Hands the ciphertext to apps/api for decryption, and records who asked. */
export const apiReveal = serverUserMutation({
  role: "admin",
  args: { entryId: v.id("vaultEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get(entryId);
    if (!entry) throw new ConvexError({ code: "not_found", message: "Zugang nicht gefunden." });
    await log(ctx, entry._id, ctx.caller.id, "revealed");
    return { passwordEnc: entry.passwordEnc, notesEnc: entry.notesEnc ?? null };
  },
});

export const remove = userMutation({
  role: "admin",
  args: { entryId: v.id("vaultEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get(entryId);
    if (!entry) return;
    await moveToTrash(ctx, "vaultEntries", entryId, ctx.caller.id);
    await log(ctx, entryId, ctx.caller.id, "deleted");
  },
});
