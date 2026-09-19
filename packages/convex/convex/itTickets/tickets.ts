import { userMutation, userQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { autoLockThreadOnTicketClosed } from "./lib/threads";
import { displayName } from "../lib/users";
import { moveToTrash } from "../lib/trash";

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
const relatedLinksValidator = v.array(
  v.object({
    type: v.union(
      v.literal("guidebook"),
      v.literal("announcement"),
      v.literal("error_measure"),
      v.literal("other"),
    ),
    label: v.string(),
    url: v.string(),
  }),
);

type TicketStatus = "offen" | "bearbeitung" | "closed";

async function recordStatusChange(
  ctx: MutationCtx,
  args: {
    ticketId: Id<"itTickets">;
    status: TicketStatus;
    previousStatus?: TicketStatus;
    changedByUserId: Id<"users">;
  },
) {
  await ctx.db.insert("itTicketStatusHistory", {
    ...args,
    changedAt: Date.now(),
  });
}

function validateRelatedLinks(links: Array<{ label: string; url: string }>) {
  if (links.length > 5) {
    throw new ConvexError({ code: "bad_request", message: "At most five related links" });
  }
  for (const link of links) {
    if (!link.label.trim() || !link.url.trim()) {
      throw new ConvexError({ code: "bad_request", message: "Related links need a label and URL" });
    }
    if (link.url.startsWith("/")) continue;
    try {
      const parsed = new URL(link.url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      throw new ConvexError({ code: "bad_request", message: "Related link URL is invalid" });
    }
  }
}

// --- Categories --------------------------------------------------------------

export const listCategories = userQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("itTicketCategories").collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => ({ _id: row._id, name: row.name }));
  },
});

/** Seeds the default category set the first time anyone opens the tool. */
export const ensureDefaultCategories = userMutation({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const existing = await ctx.db.query("itTicketCategories").take(1);
    if (existing.length > 0) return { seeded: false };
    const now = Date.now();
    for (const name of DEFAULT_CATEGORIES) {
      await ctx.db.insert("itTicketCategories", { name, createdBy: user._id, createdAt: now });
    }
    return { seeded: true };
  },
});

export const createCategory = userMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = ctx.caller.user;
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

export const removeCategory = userMutation({
  args: { categoryId: v.id("itTicketCategories") },
  handler: async (ctx, { categoryId }) => {
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

export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("itTickets").order("desc").take(500);
  },
});

/**
 * The caller's own still-open tickets, for the dashboard card. Deliberately
 * not a client-side filter over `list`: that returns the newest 500 tickets
 * org-wide, so an older unresolved ticket of yours drops off once 500 newer
 * ones exist — and every dashboard session would subscribe to hundreds of
 * unrelated documents to render five rows.
 */
export const listMineOpen = userQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = ctx.caller.user;
    const rows = await ctx.db
      .query("itTickets")
      .withIndex("by_creator", (q) => q.eq("createdByUserId", user._id))
      .order("desc")
      .collect();
    return rows.filter((t) => t.status !== "closed").slice(0, limit ?? 5);
  },
});

/** Earlier tickets that look like the one being filed — same category, and
 * sharing a topic or words from the description. Resolved ones rank first. */
export const similar = userQuery({
  args: { category: v.string(), topic: v.optional(v.string()), text: v.string() },
  handler: async (ctx, { category, topic, text }) => {
    const words = new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4),
    );
    if (words.size === 0 && !topic) return [];
    const rows = await ctx.db.query("itTickets").order("desc").take(500);
    return rows
      .filter((row) => row.category === category)
      .map((row) => {
        const haystack = `${row.topic ?? ""} ${row.info ?? ""}`.toLowerCase();
        let score = topic && row.topic === topic ? 2 : 0;
        for (const word of words) if (haystack.includes(word)) score++;
        return { row, score };
      })
      .filter(({ score }) => score >= 2)
      .sort(
        (a, b) =>
          Number(b.row.status === "closed") - Number(a.row.status === "closed") ||
          b.score - a.score,
      )
      .slice(0, 3)
      .map(({ row }) => ({
        _id: row._id,
        nr: row.nr,
        topic: row.topic ?? null,
        info: row.info ?? null,
        status: row.status,
      }));
  },
});

/** Open tickets someone handed to the caller — the home page's "Needs you". */
export const listAssignedOpen = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.caller.user;
    const rows = await ctx.db
      .query("itTickets")
      .withIndex("by_assignee", (q) => q.eq("assignedToUserId", user._id))
      .collect();
    return rows
      .filter((t) => t.status !== "closed")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => ({
        _id: t._id,
        nr: t.nr,
        category: t.category,
        topic: t.topic ?? null,
        status: t.status,
        createdByName: t.createdByName,
        createdAt: t.createdAt,
      }));
  },
});

/** When someone other than the reporter first reacted — a status change or a
 * chat reply, whichever came first. `respondedAt` stays null while waiting. */
export const firstResponse = userQuery({
  args: { ticketId: v.id("itTickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) return null;
    const history = await ctx.db
      .query("itTicketStatusHistory")
      .withIndex("by_ticket_and_changedAt", (q) => q.eq("ticketId", ticketId))
      .order("asc")
      .take(50);
    // the first row is the ticket being filed, not a response
    const firstChange = history.find(
      (row) => row.previousStatus && row.changedByUserId !== ticket.createdByUserId,
    );
    const candidates = firstChange ? [firstChange.changedAt] : [];
    const thread = await ctx.db
      .query("itTicketThreads")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .first();
    if (thread) {
      const messages = await ctx.db
        .query("itTicketMessages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .take(50);
      const reply = messages.find(
        (m) => m.kind === "message" && m.senderUserId !== ticket.createdByUserId,
      );
      if (reply) candidates.push(reply.createdAt);
    }
    return {
      createdAt: ticket.createdAt,
      respondedAt: candidates.length ? Math.min(...candidates) : null,
    };
  },
});

export const listStatusHistory = userQuery({
  args: { ticketId: v.id("itTickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    const rows = await ctx.db
      .query("itTicketStatusHistory")
      .withIndex("by_ticket_and_changedAt", (q) => q.eq("ticketId", ticketId))
      .order("desc")
      .take(50);
    return Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db.get(row.changedByUserId);
        return {
          _id: row._id,
          status: row.status,
          previousStatus: row.previousStatus ?? null,
          changedAt: row.changedAt,
          changedByName: displayName(user),
        };
      }),
    );
  },
});

export const create = userMutation({
  args: ticketFields,
  handler: async (ctx, args) => {
    const user = ctx.caller.user;
    const createdByName = args.createdByName.trim();
    if (!createdByName) {
      throw new ConvexError({ code: "bad_request", message: '"Angelegt von" is required' });
    }
    const last = await ctx.db.query("itTickets").withIndex("by_nr").order("desc").first();
    const nr = (last?.nr ?? 0) + 1;
    const now = Date.now();
    const ticketId = await ctx.db.insert("itTickets", {
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
      createdAt: now,
    });
    await recordStatusChange(ctx, {
      ticketId,
      status: args.status,
      changedByUserId: user._id,
    });
    return ticketId;
  },
});

export const update = userMutation({
  args: { ticketId: v.id("itTickets"), ...ticketFields },
  handler: async (ctx, { ticketId, ...args }) => {
    const user = ctx.caller.user;
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    }
    const statusChanged = args.status !== ticket.status;
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
    if (statusChanged) {
      await recordStatusChange(ctx, {
        ticketId,
        status: args.status,
        previousStatus: ticket.status,
        changedByUserId: user._id,
      });
    }
    if (args.status === "closed" && ticket.status !== "closed") {
      await autoLockThreadOnTicketClosed(ctx, ticketId, user._id);
    }
    return { ok: true };
  },
});

/** Lightweight status-only change for the inline select in the ticket list. */
export const setStatus = userMutation({
  args: { ticketId: v.id("itTickets"), status: statusValidator },
  handler: async (ctx, { ticketId, status }) => {
    const user = ctx.caller.user;
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    }
    await ctx.db.patch(ticketId, { status, updatedAt: Date.now() });
    if (status !== ticket.status) {
      await recordStatusChange(ctx, {
        ticketId,
        status,
        previousStatus: ticket.status,
        changedByUserId: user._id,
      });
    }
    if (status === "closed" && ticket.status !== "closed") {
      await autoLockThreadOnTicketClosed(ctx, ticketId, user._id);
    }
    return { ok: true };
  },
});

/** Managers own the queue assignment, while the shared-log status and detail
 * edits intentionally remain available to every active intranet user. */
export const setAssignee = userMutation({
  role: "manager",
  args: {
    ticketId: v.id("itTickets"),
    assignedToUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { ticketId, assignedToUserId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    }
    if (assignedToUserId) {
      const assignee = await ctx.db.get(assignedToUserId);
      if (!assignee || assignee.status !== "active") {
        throw new ConvexError({ code: "bad_request", message: "Assignee must be active" });
      }
    }
    await ctx.db.patch(ticketId, {
      assignedToUserId,
      assignedAt: assignedToUserId ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Related context stays on the ticket itself rather than becoming a separate
 * task or relation system. It follows the shared-log access rule above. */
export const setRelatedLinks = userMutation({
  args: {
    ticketId: v.id("itTickets"),
    relatedLinks: relatedLinksValidator,
  },
  handler: async (ctx, { ticketId, relatedLinks }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    validateRelatedLinks(relatedLinks);
    await ctx.db.patch(ticketId, { relatedLinks, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const remove = userMutation({
  args: { ticketId: v.id("itTickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) return { ok: false };
    // The person who opened it, or a manager.
    ctx.caller.require(ticket.createdByUserId === ctx.caller.id || ctx.caller.isManager);
    await moveToTrash(ctx, "itTickets", ticketId, ctx.caller.id);
    return { ok: true };
  },
});
