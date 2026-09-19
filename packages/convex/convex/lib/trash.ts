import { type Rules } from "convex-helpers/server/rowLevelSecurity";

import { type DataModel, type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { purgeApplicant } from "../hr/lib/retention";
import { recordUnifiedAudit } from "./auditLogWrite";
import { purgeConversation } from "./chat";

/**
 * Soft delete. Deleting one of these marks it `deletedAt` instead of removing
 * it; the builders in functions.ts hide marked rows from every read, so a
 * deleted item disappears everywhere at once and can still be restored. After
 * `TRASH_DAYS` the purge cron removes it for real, along with what hangs off
 * it.
 *
 * Only for things people author and might want back. Security tokens,
 * telemetry and caches keep hard deletes.
 */
export const TRASH_DAYS = 30;

export const TRASH_TABLES = [
  "announcements",
  "applicants",
  "blogPosts",
  "conversations",
  "errorReports",
  "errorMeasures",
  "events",
  "guidebookPages",
  "itTickets",
  "suggestions",
  "updates",
  "wikiEntries",
  "salesCoachEvWiki",
] as const;

export type TrashTable = (typeof TRASH_TABLES)[number];

/** Row-level rules for the builders: trashed rows don't exist unless a
 *  function asks for `ctx.unfilteredDb`. */
export const hideTrashed = Object.fromEntries(
  TRASH_TABLES.map((table) => [
    table,
    { read: async (_ctx: unknown, doc: { deletedAt?: number }) => doc.deletedAt === undefined },
  ]),
) as Rules<unknown, DataModel>;

/** How a trashed row is named in lists and the audit log. */
export function trashLabel(table: TrashTable, doc: Doc<TrashTable>): string {
  switch (table) {
    case "errorReports":
    case "errorMeasures":
      return (doc as Doc<"errorReports">).description.slice(0, 120);
    case "itTickets": {
      const ticket = doc as Doc<"itTickets">;
      return ticket.topic?.trim() || `#${ticket.nr}`;
    }
    case "wikiEntries":
      return (doc as Doc<"wikiEntries">).thema;
    case "applicants":
      return (doc as Doc<"applicants">).name;
    case "conversations":
      return (doc as Doc<"conversations">).name ?? "Group";
    default:
      return (doc as { title: string }).title;
  }
}

function audit(
  ctx: TrashDb,
  action: "trash.delete" | "trash.restore" | "trash.purge",
  actorUserId: Id<"users">,
  table: TrashTable,
  doc: Doc<TrashTable>,
) {
  return recordUnifiedAudit(ctx as MutationCtx, {
    domain: "content",
    actorUserId,
    action,
    target: trashLabel(table, doc),
    detail: table,
    at: Date.now(),
  });
}

type TrashDb = Pick<MutationCtx, "db">;

export async function moveToTrash(
  ctx: TrashDb,
  table: TrashTable,
  id: Id<TrashTable>,
  deletedBy: Id<"users">,
): Promise<void> {
  const doc = await ctx.db.get(id);
  if (!doc) return;
  const deletedAt = Date.now();
  await ctx.db.patch(id, { deletedAt, deletedBy });
  await audit(ctx, "trash.delete", deletedBy, table, doc);
  // A report's measures go with it, and come back with it.
  if (table === "errorReports") {
    const measures = await ctx.db
      .query("errorMeasures")
      .withIndex("by_error", (q) => q.eq("errorReportId", id as Id<"errorReports">))
      .collect();
    for (const m of measures) {
      if (m.deletedAt === undefined) await ctx.db.patch(m._id, { deletedAt, deletedBy });
    }
  }
  // Unread counts from a chat nobody can open any more would just linger.
  if (table === "conversations") {
    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", id as Id<"conversations">))
      .collect();
    for (const m of members) if (m.unreadCount) await ctx.db.patch(m._id, { unreadCount: 0 });
  }
}

export async function restoreFromTrash(
  ctx: TrashDb,
  table: TrashTable,
  doc: Doc<TrashTable>,
  restoredBy: Id<"users">,
): Promise<void> {
  await ctx.db.patch(doc._id, { deletedAt: undefined, deletedBy: undefined });
  await audit(ctx, "trash.restore", restoredBy, table, doc);
  if (table === "errorReports") {
    const measures = await ctx.db
      .query("errorMeasures")
      .withIndex("by_error", (q) => q.eq("errorReportId", doc._id as Id<"errorReports">))
      .collect();
    for (const m of measures) {
      if (m.deletedAt === doc.deletedAt) {
        await ctx.db.patch(m._id, { deletedAt: undefined, deletedBy: undefined });
      }
    }
  }
}

/** The hard delete, with everything that only makes sense next to the row. */
export async function purge(
  ctx: MutationCtx,
  table: TrashTable,
  doc: Doc<TrashTable>,
): Promise<void> {
  if (doc.deletedBy) await audit(ctx, "trash.purge", doc.deletedBy, table, doc);
  // These two already know how to remove themselves with everything attached.
  if (table === "applicants") return purgeApplicant(ctx, doc._id as Id<"applicants">);
  if (table === "conversations") return purgeConversation(ctx, doc._id as Id<"conversations">);
  switch (table) {
    case "announcements": {
      const a = doc as Doc<"announcements">;
      for (const sid of a.attachmentStorageIds) await ctx.storage.delete(sid);
      for (const child of ["announcementReads", "announcementAcks"] as const) {
        const rows = await ctx.db
          .query(child)
          .withIndex("by_announcement_user", (q) => q.eq("announcementId", a._id))
          .collect();
        for (const row of rows) await ctx.db.delete(row._id);
      }
      const reactions = await ctx.db
        .query("announcementReactions")
        .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
        .collect();
      for (const row of reactions) await ctx.db.delete(row._id);
      break;
    }
    case "blogPosts": {
      const post = doc as Doc<"blogPosts">;
      if (post.mainImageStorageId) await ctx.storage.delete(post.mainImageStorageId);
      break;
    }
    case "guidebookPages": {
      for (const sid of (doc as Doc<"guidebookPages">).imageStorageIds) {
        await ctx.storage.delete(sid);
      }
      break;
    }
    case "itTickets": {
      const ticketId = doc._id as Id<"itTickets">;
      const history = await ctx.db
        .query("itTicketStatusHistory")
        .withIndex("by_ticket_and_changedAt", (q) => q.eq("ticketId", ticketId))
        .collect();
      for (const row of history) await ctx.db.delete(row._id);
      const threads = await ctx.db
        .query("itTicketThreads")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
        .collect();
      for (const thread of threads) {
        const messages = await ctx.db
          .query("itTicketMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect();
        for (const m of messages) await ctx.db.delete(m._id);
        await ctx.db.delete(thread._id);
      }
      break;
    }
    case "suggestions": {
      const s = doc as Doc<"suggestions">;
      for (const a of s.attachments ?? []) await ctx.storage.delete(a.storageId);
      const votes = await ctx.db
        .query("suggestionVotes")
        .withIndex("by_suggestion", (q) => q.eq("suggestionId", s._id))
        .collect();
      for (const vote of votes) await ctx.db.delete(vote._id);
      break;
    }
    case "updates": {
      const updateId = doc._id as Id<"updates">;
      const dismissals = await ctx.db
        .query("updateDismissals")
        .withIndex("by_update_user", (q) => q.eq("updateId", updateId))
        .collect();
      for (const row of dismissals) await ctx.db.delete(row._id);
      const emails = await ctx.db
        .query("updateEmailRecipients")
        .withIndex("by_update", (q) => q.eq("updateId", updateId))
        .collect();
      for (const row of emails) await ctx.db.delete(row._id);
      break;
    }
    case "salesCoachEvWiki": {
      const article = doc as Doc<"salesCoachEvWiki">;
      if (article.storageId) await ctx.storage.delete(article.storageId);
      break;
    }
  }
  await ctx.db.delete(doc._id);
}
