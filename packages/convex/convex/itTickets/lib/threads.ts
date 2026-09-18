import { type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";

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
