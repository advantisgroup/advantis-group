import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { type MutationCtx } from "./_generated/server";
import { userMutation, userQuery } from "./functions";
import { moveToTrash } from "./lib/trash";
import { displayName } from "./lib/users";

/**
 * Schlüssel: which physical key is with which employee. Admins only. Every
 * hand-over is written to `officeKeyEvents`, so "who had the cellar key in
 * March" stays answerable after it changed hands.
 */

type Action = "created" | "edited" | "issued" | "returned" | "deleted";

function log(
  ctx: Pick<MutationCtx, "db">,
  keyId: Id<"officeKeys">,
  byUserId: Id<"users">,
  action: Action,
  holderUserId?: Id<"users">,
) {
  return ctx.db.insert("officeKeyEvents", {
    keyId,
    action,
    holderUserId,
    byUserId,
    at: Date.now(),
  });
}

const clean = (value: string | undefined, max: number) => {
  const trimmed = value?.trim().slice(0, max);
  return trimmed ? trimmed : undefined;
};

async function existing(ctx: Pick<MutationCtx, "db">, keyId: Id<"officeKeys">) {
  const key = await ctx.db.get(keyId);
  if (!key) throw new ConvexError({ code: "not_found", message: "Schlüssel nicht gefunden." });
  return key;
}

export const list = userQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db.query("officeKeys").withIndex("by_label").collect();
    const holders = new Map<Id<"users">, { name: string; active: boolean }>();
    for (const key of keys) {
      if (key.holderUserId && !holders.has(key.holderUserId)) {
        const user = await ctx.db.get(key.holderUserId);
        holders.set(key.holderUserId, {
          name: displayName(user),
          active: user?.status === "active",
        });
      }
    }
    return keys.map((key) => {
      const holder = key.holderUserId ? holders.get(key.holderUserId) : undefined;
      return {
        id: key._id,
        label: key.label,
        number: key.number ?? null,
        opens: key.opens ?? null,
        note: key.note ?? null,
        holderUserId: key.holderUserId ?? null,
        holderName: holder?.name ?? null,
        /** Still holds a key but has left or been suspended. */
        holderGone: holder ? !holder.active : false,
        issuedAt: key.issuedAt ?? null,
      };
    });
  },
});

export const history = userQuery({
  role: "admin",
  args: { keyId: v.id("officeKeys") },
  handler: async (ctx, { keyId }) => {
    const rows = await ctx.db
      .query("officeKeyEvents")
      .withIndex("by_key", (q) => q.eq("keyId", keyId))
      .order("desc")
      .take(50);
    const names = new Map<Id<"users">, string>();
    const name = async (id: Id<"users">) => {
      if (!names.has(id)) names.set(id, displayName(await ctx.db.get(id)));
      return names.get(id)!;
    };
    return Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        action: row.action,
        at: row.at,
        byName: await name(row.byUserId),
        holderName: row.holderUserId ? await name(row.holderUserId) : null,
      })),
    );
  },
});

const fields = {
  label: v.string(),
  number: v.optional(v.string()),
  opens: v.optional(v.string()),
  note: v.optional(v.string()),
};

function cleaned(args: { label: string; number?: string; opens?: string; note?: string }) {
  const label = clean(args.label, 120);
  if (!label) throw new ConvexError({ code: "validation", message: "Bezeichnung fehlt." });
  return {
    label,
    number: clean(args.number, 40),
    opens: clean(args.opens, 200),
    note: clean(args.note, 1000),
  };
}

export const create = userMutation({
  role: "admin",
  args: { ...fields, holderUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("officeKeys", {
      ...cleaned(args),
      holderUserId: args.holderUserId,
      issuedAt: args.holderUserId ? now : undefined,
      createdBy: ctx.caller.id,
      createdAt: now,
      updatedAt: now,
    });
    await log(ctx, id, ctx.caller.id, "created");
    if (args.holderUserId) await log(ctx, id, ctx.caller.id, "issued", args.holderUserId);
    return id;
  },
});

export const update = userMutation({
  role: "admin",
  args: { keyId: v.id("officeKeys"), ...fields },
  handler: async (ctx, { keyId, ...args }) => {
    await existing(ctx, keyId);
    await ctx.db.patch(keyId, { ...cleaned(args), updatedAt: Date.now() });
    await log(ctx, keyId, ctx.caller.id, "edited");
  },
});

/** Hand the key to someone (a direct hand-over counts as return + issue), or
 *  take it back with `holderUserId: null`. */
export const setHolder = userMutation({
  role: "admin",
  args: { keyId: v.id("officeKeys"), holderUserId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, { keyId, holderUserId }) => {
    const key = await existing(ctx, keyId);
    if ((key.holderUserId ?? null) === holderUserId) return;
    const now = Date.now();
    if (key.holderUserId) await log(ctx, keyId, ctx.caller.id, "returned", key.holderUserId);
    await ctx.db.patch(keyId, {
      holderUserId: holderUserId ?? undefined,
      issuedAt: holderUserId ? now : undefined,
      updatedAt: now,
    });
    if (holderUserId) await log(ctx, keyId, ctx.caller.id, "issued", holderUserId);
  },
});

export const remove = userMutation({
  role: "admin",
  args: { keyId: v.id("officeKeys") },
  handler: async (ctx, { keyId }) => {
    if (!(await ctx.db.get(keyId))) return;
    await moveToTrash(ctx, "officeKeys", keyId, ctx.caller.id);
    await log(ctx, keyId, ctx.caller.id, "deleted");
  },
});
