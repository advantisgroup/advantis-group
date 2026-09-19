import { ConvexError } from "convex/values";
import { type Doc, type Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "../_generated/server";
import { profileAvatarUrl, profileDisplayName } from "./profile";

/** Chat's shared helpers: membership, DM keys and the previews and URLs its
 *  queries hand back. chat.ts holds the functions. */

/** Chat's own return shapes use `_id`/`avatar` field names throughout (not
 *  `PartialProfile`'s `userId`/`avatarUrl`) to stay consistent with the rest
 *  of this file's conventions — but the actual name/avatar resolution
 *  delegates to the one canonical implementation in `lib/profile.ts` instead
 *  of maintaining its own copy. */
export function memberDisplay(user: Doc<"users"> | null): string {
  return user ? profileDisplayName(user) : "Unknown";
}

export async function getMembership(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<Doc<"conversationMembers"> | null> {
  // A group in the trash keeps its members for a restore, but is closed meanwhile.
  if (!(await ctx.db.get(conversationId))) return null;
  return ctx.db
    .query("conversationMembers")
    .withIndex("by_user_conversation", (q) =>
      q.eq("userId", userId).eq("conversationId", conversationId),
    )
    .unique();
}

export async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<Doc<"conversationMembers">> {
  const membership = await getMembership(ctx, conversationId, userId);
  if (!membership) {
    throw new ConvexError({
      code: "forbidden",
      message: "You are not a member of this conversation",
    });
  }
  return membership;
}

export function dmKeyFor(a: Id<"users">, b: Id<"users">): string {
  return [a, b].sort().join(":");
}

export async function attachmentUrls(ctx: QueryCtx, attachments: Doc<"messages">["attachments"]) {
  return Promise.all(
    attachments.map(async (a) => ({
      ...a,
      url: await ctx.storage.getUrl(a.storageId),
    })),
  );
}

/** Resolve a user's display avatar (uploaded image first, else external URL). */
export async function userAvatar(ctx: QueryCtx, user: Doc<"users"> | null): Promise<string | null> {
  return user ? profileAvatarUrl(ctx, user) : null;
}

/** The other participant of a DM, derived from its immutable `dmKey`. Works
 *  even after that person has left (their membership row is gone). */
export function dmPartnerId(
  conversation: Doc<"conversations">,
  meId: Id<"users">,
): Id<"users"> | null {
  if (conversation.type !== "dm" || !conversation.dmKey) return null;
  const ids = conversation.dmKey.split(":") as Id<"users">[];
  return ids.find((id) => id !== meId) ?? null;
}

/** Sidebar preview text for a message — mirrors what listConversations used
 *  to compute on the fly from the live row before it was denormalized onto
 *  conversations.lastMessagePreview. */
export function messagePreview(body: string, attachmentCount: number): string {
  return body || (attachmentCount > 0 ? "📎 Attachment" : "");
}

/** Pre-migration fallback for conversations.lastMessagePreview: the exact
 *  query listConversations used to run on every single execution. */
export async function legacyLastMessagePreview(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<string> {
  const lastMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .first();
  if (!lastMessage) return "";
  return lastMessage.deletedAt
    ? "Message deleted"
    : messagePreview(lastMessage.body, lastMessage.attachments.length);
}

/** Pre-migration fallback for conversationMembers.unreadCount: the exact
 *  `.take(50)` scan listConversations used to run on every single execution. */
export async function legacyUnreadCount(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  lastReadAt: number,
  meId: Id<"users">,
): Promise<number> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .take(50);
  return recent.filter((m) => m.createdAt > lastReadAt && m.senderUserId !== meId).length;
}

export function requireGroup(conversation: Doc<"conversations"> | null): void {
  if (!conversation || conversation.type !== "group") {
    throw new ConvexError({
      code: "bad_request",
      message: "This action is only available for group chats",
    });
  }
}

/** Tear a conversation down completely: messages (+ their storage & reactions),
 *  typing rows, memberships, any group photo, then the conversation itself.
 *  Shared by leave (last member), delete-group and the expired-DM cron. */
export async function purgeConversation(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
): Promise<void> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  for (const m of messages) {
    for (const a of m.attachments) await ctx.storage.delete(a.storageId);
    const reactions = await ctx.db
      .query("messageReactions")
      .withIndex("by_message", (q) => q.eq("messageId", m._id))
      .collect();
    await Promise.all(reactions.map((r) => ctx.db.delete(r._id)));
    await ctx.db.delete(m._id);
  }
  const typing = await ctx.db
    .query("typing")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  await Promise.all(typing.map((t) => ctx.db.delete(t._id)));
  const members = await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  await Promise.all(members.map((m) => ctx.db.delete(m._id)));
  const conversation = await ctx.db.get(conversationId);
  if (conversation?.avatarStorageId) {
    await ctx.storage.delete(conversation.avatarStorageId);
  }
  await ctx.db.delete(conversationId);
}

// --- Messages ----------------------------------------------------------------

export function aggregateReactions(
  rows: { emoji: string; userId: Id<"users"> }[],
  meId: Id<"users">,
): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const entry = map.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.userId === meId) entry.mine = true;
    map.set(r.emoji, entry);
  }
  return [...map.entries()].map(([emoji, e]) => ({
    emoji,
    count: e.count,
    mine: e.mine,
  }));
}
