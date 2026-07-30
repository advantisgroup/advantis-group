import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { autoLockThreadOnTicketClosed } from "./itTicketThreads";
import { requireUser } from "./lib/auth";

/**
 * IT-Meldesystem: a shared IT issue log. Every active intranet user can file,
 * edit, and close any ticket — there is no per-author ownership check here,
 * matching the original tool this replaces ("all entries are saved together
 * and are visible/editable by every user of this system").
 */

const DEFAULT_CATEGORIES = ["SF", "Office", "Genesys", "Hardware", "Internet", "other"];

export const statusValidator = v.union(
  v.literal("offen"),
  v.literal("bearbeitung"),
  v.literal("closed"),
);

// --- Categories --------------------------------------------------------------

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("itTicketCategories").collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => ({ _id: row._id, name: row.name }));
  },
});

/** Seeds the default category set the first time anyone opens the tool. */
export const ensureDefaultCategories = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.query("itTicketCategories").take(1);
    if (existing.length > 0) return { seeded: false };
    const now = Date.now();
    for (const name of DEFAULT_CATEGORIES) {
      await ctx.db.insert("itTicketCategories", { name, createdBy: user._id, createdAt: now });
    }
    return { seeded: true };
  },
});

export const createCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Name is required" });
    }
    const existing = await ctx.db.query("itTicketCategories").collect();
    if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new ConvexError({ code: "conflict", message: "Category already exists" });
    }
    return ctx.db.insert("itTicketCategories", {
      name: trimmed,
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});

export const removeCategory = mutation({
  args: { categoryId: v.id("itTicketCategories") },
  handler: async (ctx, { categoryId }) => {
    await requireUser(ctx);
    // Existing tickets reference a category by its name (string), so deleting
    // the category row here is purely cosmetic — their history stays intact.
    await ctx.db.delete(categoryId);
  },
});

// --- Tickets -------------------------------------------------------------------

const ticketFields = {
  category: v.string(),
  date: v.string(),
  createdByName: v.string(),
  status: statusValidator,
  topic: v.optional(v.string()),
  camId: v.optional(v.string()),
  custNo: v.optional(v.string()),
  info: v.optional(v.string()),
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.db.query("itTickets").order("desc").take(500);
  },
});

export const create = mutation({
  args: ticketFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const createdByName = args.createdByName.trim();
    if (!createdByName) {
      throw new ConvexError({ code: "bad_request", message: '"Angelegt von" is required' });
    }
    const last = await ctx.db.query("itTickets").withIndex("by_nr").order("desc").first();
    const nr = (last?.nr ?? 0) + 1;
    return ctx.db.insert("itTickets", {
      nr,
      category: args.category,
      date: args.date,
      createdByName,
      createdByUserId: user._id,
      status: args.status,
      topic: args.topic?.trim() || undefined,
      camId: args.camId?.trim() || undefined,
      custNo: args.custNo?.trim() || undefined,
      info: args.info?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { ticketId: v.id("itTickets"), ...ticketFields },
  handler: async (ctx, { ticketId, ...args }) => {
    const user = await requireUser(ctx);
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    }
    await ctx.db.patch(ticketId, {
      category: args.category,
      date: args.date,
      createdByName: args.createdByName.trim() || ticket.createdByName,
      status: args.status,
      topic: args.topic?.trim() || undefined,
      camId: args.camId?.trim() || undefined,
      custNo: args.custNo?.trim() || undefined,
      info: args.info?.trim() || undefined,
      updatedAt: Date.now(),
    });
    if (args.status === "closed" && ticket.status !== "closed") {
      await autoLockThreadOnTicketClosed(ctx, ticketId, user._id);
    }
    return { ok: true };
  },
});

/** Lightweight status-only change for the inline select in the ticket list. */
export const setStatus = mutation({
  args: { ticketId: v.id("itTickets"), status: statusValidator },
  handler: async (ctx, { ticketId, status }) => {
    const user = await requireUser(ctx);
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    }
    await ctx.db.patch(ticketId, { status, updatedAt: Date.now() });
    if (status === "closed" && ticket.status !== "closed") {
      await autoLockThreadOnTicketClosed(ctx, ticketId, user._id);
    }
    return { ok: true };
  },
});

export const remove = mutation({
  args: { ticketId: v.id("itTickets") },
  handler: async (ctx, { ticketId }) => {
    await requireUser(ctx);
    await ctx.db.delete(ticketId);
    return { ok: true };
  },
});
