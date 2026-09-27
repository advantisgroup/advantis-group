import { ConvexError, v } from "convex/values";

import { userMutation, userQuery } from "../functions";

/** Everyone signed in sees the tools, in the order admins set. */
export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("companyTools").collect();
    return rows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        url: r.url,
        description: r.description ?? null,
      }));
  },
});

function clean(args: { name: string; url: string; description?: string }) {
  const name = args.name.trim();
  const url = args.url.trim();
  if (!name) throw new ConvexError({ code: "bad_request", message: "A name is required" });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConvexError({ code: "bad_request", message: "The link must be a full web address" });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ConvexError({ code: "bad_request", message: "The link must be a full web address" });
  }
  return { name, url: parsed.toString(), description: args.description?.trim() || undefined };
}

const fields = { name: v.string(), url: v.string(), description: v.optional(v.string()) };

export const create = userMutation({
  role: "admin",
  args: fields,
  handler: async (ctx, args) => {
    const last = (await ctx.db.query("companyTools").collect()).reduce(
      (max, r) => Math.max(max, r.sortOrder),
      0,
    );
    return ctx.db.insert("companyTools", {
      ...clean(args),
      sortOrder: last + 1,
      createdBy: ctx.caller.user._id,
      createdAt: Date.now(),
    });
  },
});

export const update = userMutation({
  role: "admin",
  args: { id: v.id("companyTools"), ...fields },
  handler: async (ctx, { id, ...args }) => {
    if (!(await ctx.db.get(id))) throw new ConvexError({ code: "not_found", message: "Not found" });
    const { name, url, description } = clean(args);
    await ctx.db.patch(id, { name, url, description });
  },
});

/** Moves a tool one place up or down. */
export const move = userMutation({
  role: "admin",
  args: { id: v.id("companyTools"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, { id, direction }) => {
    const rows = (await ctx.db.query("companyTools").collect()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const i = rows.findIndex((r) => r._id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    await ctx.db.patch(rows[i]._id, { sortOrder: rows[j].sortOrder });
    await ctx.db.patch(rows[j]._id, { sortOrder: rows[i].sortOrder });
  },
});

export const remove = userMutation({
  role: "admin",
  args: { id: v.id("companyTools") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
