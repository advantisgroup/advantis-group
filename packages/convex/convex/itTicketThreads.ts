import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { requireCapability, requireUser } from "./lib/auth";

/**
 * Per-ticket chat threads for the IT-Meldesystem: unlike the ticket log
 * itself (open to every active user), starting a thread, posting in one, or
 * locking/unlocking it requires the `manage_it_ticket_threads` capability
 * (managers/admins hold it implicitly via `requireCapability`). Anyone can
 * still read a thread once it exists — the restriction is on writing, not
 * viewing, mirroring the ticket log's own org-wide visibility.
 */

function displayName(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

async function requireThread(ctx: MutationCtx, threadId: Id<"itTicketThreads">) {
  const thread = await ctx.db.get(threadId);
  if (!thread) {
    throw new ConvexError({ code: "not_found", message: "Thread not found" });
  }
  return thread;
}

export const getForTicket = query({
  args: { ticketId: v.id("itTickets") },
  handler: async (ctx, { ticketId }) => {
    await requireUser(ctx);
    const thread = await ctx.db
      .query("itTicketThreads")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .unique();
    if (!thread) return null;
    const [createdBy, lockedBy] = await Promise.all([
      ctx.db.get(thread.createdByUserId),
      thread.lockedByUserId ? ctx.db.get(thread.lockedByUserId) : null,
    ]);
    return {
      _id: thread._id,
      ticketId: thread.ticketId,
      createdByUserId: thread.createdByUserId,
      createdByName: displayName(createdBy),
      createdAt: thread.createdAt,
      lastMessageAt: thread.lastMessageAt,
      lockedAt: thread.lockedAt ?? null,
      lockedByUserId: thread.lockedByUserId ?? null,
      lockedByName: thread.lockedByUserId ? displayName(lockedBy) : null,
      lockReason: thread.lockReason ?? null,
    };
  },
});

/** Every ticket that already has a thread — the quick-nav list in the ticket
 * detail view, sorted by most recently active. */
export const listStarted = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const threads = await ctx.db.query("itTicketThreads").collect();
    return threads
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .map((t) => ({
        _id: t._id,
        ticketId: t.ticketId,
        lastMessageAt: t.lastMessageAt,
        lockedAt: t.lockedAt ?? null,
      }));
  },
});

export const start = mutation({
  args: { ticketId: v.id("itTickets") },
  handler: async (ctx, { ticketId }) => {
    const user = await requireCapability(ctx, "manage_it_ticket_threads");
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "not_found", message: "Ticket not found" });
    }
    const existing = await ctx.db
      .query("itTicketThreads")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .unique();
    if (existing) {
      throw new ConvexError({ code: "conflict", message: "This ticket already has a thread" });
    }
    const now = Date.now();
    const id = await ctx.db.insert("itTicketThreads", {
      ticketId,
      createdByUserId: user._id,
      createdAt: now,
      lastMessageAt: now,
    });
    return { id };
  },
});

export const listMessages = query({
  args: { threadId: v.id("itTicketThreads") },
  handler: async (ctx, { threadId }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("itTicketMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    const sorted = rows.sort((a, b) => a.createdAt - b.createdAt);
    return Promise.all(
      sorted.map(async (m) => {
        if (m.kind === "system") {
          const actor = await ctx.db.get(m.actorUserId);
          return {
            _id: m._id,
            kind: "system" as const,
            event: m.event,
            actorName: displayName(actor),
            createdAt: m.createdAt,
          };
        }
        const sender = m.deletedAt ? null : await ctx.db.get(m.senderUserId);
        return {
          _id: m._id,
          kind: "message" as const,
          senderUserId: m.senderUserId,
          senderName: displayName(sender),
          body: m.deletedAt ? null : m.body,
          editedAt: m.editedAt ?? null,
          deletedAt: m.deletedAt ?? null,
          createdAt: m.createdAt,
        };
      }),
    );
  },
});

export const sendMessage = mutation({
  args: { threadId: v.id("itTicketThreads"), body: v.string() },
  handler: async (ctx, { threadId, body }) => {
    const user = await requireCapability(ctx, "manage_it_ticket_threads");
    const thread = await requireThread(ctx, threadId);
    if (thread.lockedAt) {
      throw new ConvexError({ code: "locked", message: "This chat is locked" });
    }
    const trimmed = body.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "bad_request", message: "Message can't be empty" });
    }
    const now = Date.now();
    await ctx.db.insert("itTicketMessages", {
      kind: "message",
      threadId,
      senderUserId: user._id,
      body: trimmed,
      createdAt: now,
    });
    await ctx.db.patch(threadId, { lastMessageAt: now });
    return { ok: true };
  },
});

export const lock = mutation({
  args: { threadId: v.id("itTicketThreads") },
  handler: async (ctx, { threadId }) => {
    const user = await requireCapability(ctx, "manage_it_ticket_threads");
    const thread = await requireThread(ctx, threadId);
    if (thread.lockedAt) return { ok: true };
    const now = Date.now();
    await ctx.db.patch(threadId, {
      lockedAt: now,
      lockedByUserId: user._id,
      lockReason: "manual",
    });
    await ctx.db.insert("itTicketMessages", {
      kind: "system",
      threadId,
      event: "locked",
      actorUserId: user._id,
      createdAt: now,
    });
    return { ok: true };
  },
});

export const unlock = mutation({
  args: { threadId: v.id("itTicketThreads") },
  handler: async (ctx, { threadId }) => {
    const user = await requireCapability(ctx, "manage_it_ticket_threads");
    const thread = await requireThread(ctx, threadId);
    if (!thread.lockedAt) return { ok: true };
    const now = Date.now();
    await ctx.db.patch(threadId, {
      lockedAt: undefined,
      lockedByUserId: undefined,
      lockReason: undefined,
    });
    await ctx.db.insert("itTicketMessages", {
      kind: "system",
      threadId,
      event: "unlocked",
      actorUserId: user._id,
      createdAt: now,
    });
    return { ok: true };
  },
});

/** Called from `itTickets.ts` (same transaction) when a ticket's status
 * changes to "closed" — auto-locks its thread if one exists and isn't
 * already locked. Reopening the ticket later does not auto-unlock; that's a
 * deliberate manual action via `unlock` above. */
export async function autoLockThreadOnTicketClosed(
  ctx: MutationCtx,
  ticketId: Id<"itTickets">,
  actorUserId: Id<"users">,
): Promise<void> {
  const thread = await ctx.db
    .query("itTicketThreads")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
    .unique();
  if (!thread || thread.lockedAt) return;
  const now = Date.now();
  await ctx.db.patch(thread._id, {
    lockedAt: now,
    lockedByUserId: actorUserId,
    lockReason: "ticket_closed",
  });
  await ctx.db.insert("itTicketMessages", {
    kind: "system",
    threadId: thread._id,
    event: "locked",
    actorUserId,
    createdAt: now,
  });
}
