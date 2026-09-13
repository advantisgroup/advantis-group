import { sandboxedMutation as mutation } from "./lib/sandbox";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { assertAttachmentSizeOk } from "./lib/attachments";
import { isOwnerOrAdmin, requireUser } from "./lib/auth";
import { gatedMutation } from "./lib/featureGate";
import { createNotification } from "./lib/notify";
import { profileAvatarUrl, profileDisplayName } from "./lib/profile";
import { attachmentValidator } from "./schema";

const TYPING_WINDOW_MS = 6000;
/** How long a left DM lingers before it's purged, unless the leaver rejoins. */
const DM_GRACE_MS = 48 * 60 * 60 * 1000;

const linkPreviewArg = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  siteName: v.optional(v.string()),
});

/** Chat's own return shapes use `_id`/`avatar` field names throughout (not
 *  `PartialProfile`'s `userId`/`avatarUrl`) to stay consistent with the rest
 *  of this file's conventions — but the actual name/avatar resolution
 *  delegates to the one canonical implementation in `lib/profile.ts` instead
 *  of maintaining its own copy. */
function memberDisplay(user: Doc<"users"> | null): string {
  return user ? profileDisplayName(user) : "Unknown";
}

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<Doc<"conversationMembers"> | null> {
  return ctx.db
    .query("conversationMembers")
    .withIndex("by_user_conversation", (q) =>
      q.eq("userId", userId).eq("conversationId", conversationId),
    )
    .unique();
}

async function requireMembership(
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

function dmKeyFor(a: Id<"users">, b: Id<"users">): string {
  return [a, b].sort().join(":");
}

async function attachmentUrls(ctx: QueryCtx, attachments: Doc<"messages">["attachments"]) {
  return Promise.all(
    attachments.map(async (a) => ({
      ...a,
      url: await ctx.storage.getUrl(a.storageId),
    })),
  );
}

/** Resolve a user's display avatar (uploaded image first, else external URL). */
async function userAvatar(ctx: QueryCtx, user: Doc<"users"> | null): Promise<string | null> {
  return user ? profileAvatarUrl(ctx, user) : null;
}

/** The other participant of a DM, derived from its immutable `dmKey`. Works
 *  even after that person has left (their membership row is gone). */
function dmPartnerId(conversation: Doc<"conversations">, meId: Id<"users">): Id<"users"> | null {
  if (conversation.type !== "dm" || !conversation.dmKey) return null;
  const ids = conversation.dmKey.split(":") as Id<"users">[];
  return ids.find((id) => id !== meId) ?? null;
}

/** Sidebar preview text for a message — mirrors what listConversations used
 *  to compute on the fly from the live row before it was denormalized onto
 *  conversations.lastMessagePreview. */
function messagePreview(body: string, attachmentCount: number): string {
  return body || (attachmentCount > 0 ? "📎 Attachment" : "");
}

/** Pre-migration fallback for conversations.lastMessagePreview: the exact
 *  query listConversations used to run on every single execution. */
async function legacyLastMessagePreview(
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
async function legacyUnreadCount(
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

function requireGroup(conversation: Doc<"conversations"> | null): void {
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
async function purgeConversation(
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

// --- Conversations -----------------------------------------------------------

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const rows = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation) return null;

        // Other members (for DM naming / group avatars).
        const allMembers = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
          .collect();
        const others = (
          await Promise.all(
            allMembers.filter((m) => m.userId !== user._id).map((m) => ctx.db.get(m.userId)),
          )
        ).filter((u): u is Doc<"users"> => u !== null);

        // For a DM whose partner has left, resolve them from the immutable
        // dmKey so we can still show their name (behind a "left" banner).
        const partnerId = dmPartnerId(conversation, user._id);
        const partner =
          conversation.type === "dm"
            ? (others[0] ?? (partnerId ? await ctx.db.get(partnerId) : null))
            : null;
        const otherLeft = conversation.type === "dm" && !!partnerId && others.length === 0;

        const title =
          conversation.type === "group" ? (conversation.name ?? "Group") : memberDisplay(partner);

        const avatar = conversation.type === "dm" ? await userAvatar(ctx, partner) : null;
        // Group: custom photo (if any) + up to 4 member avatars for the collage.
        const groupAvatar =
          conversation.type === "group" && conversation.avatarStorageId
            ? await ctx.storage.getUrl(conversation.avatarStorageId)
            : null;
        const memberAvatars =
          conversation.type === "group"
            ? await Promise.all(others.slice(0, 4).map((u) => userAvatar(ctx, u)))
            : [];

        // Fallback for conversations/memberships from before lastMessagePreview
        // /unreadCount existed: only taken once, since sendMessage/markRead
        // populate both fields on every subsequent write, exactly like the
        // lastSample fallback in activity/stats.ts.
        const [preview, unread] = await Promise.all([
          conversation.lastMessagePreview !== undefined
            ? conversation.lastMessagePreview
            : legacyLastMessagePreview(ctx, conversation._id),
          membership.unreadCount !== undefined
            ? membership.unreadCount
            : legacyUnreadCount(ctx, conversation._id, membership.lastReadAt, user._id),
        ]);

        return {
          _id: conversation._id,
          type: conversation.type,
          title,
          avatar,
          groupAvatar,
          memberAvatars,
          memberNames: others.slice(0, 4).map((u) => memberDisplay(u)),
          memberCount: allMembers.length,
          otherUserId: conversation.type === "dm" ? (partner?._id ?? null) : null,
          isCreator: conversation.createdByUserId === user._id,
          otherLeft,
          deleteAt: conversation.deleteAt ?? null,
          pinned: !!membership.pinnedAt,
          archived: !!membership.archivedAt,
          muted: !!membership.mutedAt,
          lastMessageAt: conversation.lastMessageAt,
          lastMessagePreview: preview,
          unread,
        };
      }),
    );

    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        // Pinned first, then most-recent activity.
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.lastMessageAt - a.lastMessageAt;
      });
  },
});

/**
 * Conversations the signed-in user and `otherUserId` are both members of —
 * the "mutual chats & groups" shown on a colleague's profile card. Returns the
 * shared DM (if any) plus every group they both belong to.
 */
export const mutualConversations = query({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, { otherUserId }) => {
    const user = await requireUser(ctx);
    if (otherUserId === user._id) return [];

    const theirConvIds = new Set(
      (
        await ctx.db
          .query("conversationMembers")
          .withIndex("by_user", (q) => q.eq("userId", otherUserId))
          .collect()
      ).map((m) => m.conversationId),
    );

    const mine = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const shared = mine.filter((m) => theirConvIds.has(m.conversationId));

    const rows = await Promise.all(
      shared.map(async (m) => {
        const conversation = await ctx.db.get(m.conversationId);
        if (!conversation) return null;

        const members = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
          .collect();

        const other = conversation.type === "dm" ? await ctx.db.get(otherUserId) : null;
        const avatar =
          conversation.type === "dm" && other
            ? other.avatarStorageId
              ? await ctx.storage.getUrl(other.avatarStorageId)
              : (other.avatarUrl ?? null)
            : null;

        return {
          _id: conversation._id,
          type: conversation.type,
          title:
            conversation.type === "group" ? (conversation.name ?? "Group") : memberDisplay(other),
          avatar,
          memberCount: members.length,
        };
      }),
    );

    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.type === "dm" ? -1 : b.type === "dm" ? 1 : 0));
  },
});

export const getOrCreateDm = gatedMutation("chat")({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, { otherUserId }) => {
    const user = await requireUser(ctx);
    if (otherUserId === user._id) {
      throw new ConvexError({
        code: "bad_request",
        message: "Cannot start a chat with yourself",
      });
    }
    const other = await ctx.db.get(otherUserId);
    if (!other || other.status !== "active") {
      throw new ConvexError({ code: "not_found", message: "User not found" });
    }

    const key = dmKeyFor(user._id, otherUserId);
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_dmKey", (q) => q.eq("dmKey", key))
      .first();
    if (existing) {
      const now = Date.now();
      const membership = await getMembership(ctx, existing._id, user._id);
      if (!membership) {
        // The caller previously left this DM (soft-deleted, pending purge)
        // — revive it instead of returning a conversation they can't access.
        await ctx.db.insert("conversationMembers", {
          conversationId: existing._id,
          userId: user._id,
          role: "member",
          lastReadAt: now,
          joinedAt: now,
        });
        await ctx.db.patch(existing._id, { deleteAt: undefined });
      }
      return { conversationId: existing._id };
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "dm",
      createdByUserId: user._id,
      lastMessageAt: now,
      dmKey: key,
      createdAt: now,
    });
    for (const uid of [user._id, otherUserId]) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: uid,
        role: "member",
        lastReadAt: now,
        joinedAt: now,
      });
    }
    return { conversationId };
  },
});

export const createGroup = gatedMutation("chat")({
  args: { name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, { name, memberIds }) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      type: "group",
      name: name.trim() || "Group",
      createdByUserId: user._id,
      lastMessageAt: now,
      createdAt: now,
    });
    const unique = new Set<Id<"users">>([user._id, ...memberIds]);
    for (const uid of unique) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: uid,
        role: uid === user._id ? "owner" : "member",
        lastReadAt: uid === user._id ? now : 0,
        joinedAt: now,
      });
    }
    return { conversationId };
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);

    // A stale `?c=<id>` link (leave/delete happened here or in another tab)
    // must degrade gracefully instead of throwing, since this query is live
    // and re-runs the moment access changes. Distinguish the two ways access
    // can go away: the conversation itself is gone ("deleted"), vs. it still
    // exists but the caller isn't part of it anymore ("not_found" — covers
    // leaving, being removed, or an unrelated/stale link).
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) {
      return { status: "deleted" as const };
    }
    const myMembership = await getMembership(ctx, conversationId, user._id);
    if (!myMembership) {
      return { status: "not_found" as const };
    }

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    const memberUsers = (await Promise.all(members.map((m) => ctx.db.get(m.userId)))).filter(
      (u): u is Doc<"users"> => u !== null,
    );
    const others = memberUsers.filter((u) => u._id !== user._id);

    // DM whose partner has left: resolve them from dmKey for name + re-invite.
    const partnerId = dmPartnerId(conversation, user._id);
    const partner =
      conversation.type === "dm"
        ? (others[0] ?? (partnerId ? await ctx.db.get(partnerId) : null))
        : null;
    const dmOtherLeft = conversation.type === "dm" && !!partnerId && others.length === 0;

    const avatar = conversation.type === "dm" ? await userAvatar(ctx, partner) : null;
    const groupAvatar =
      conversation.type === "group" && conversation.avatarStorageId
        ? await ctx.storage.getUrl(conversation.avatarStorageId)
        : null;

    return {
      status: "ok" as const,
      _id: conversation._id,
      type: conversation.type,
      title:
        conversation.type === "group" ? (conversation.name ?? "Group") : memberDisplay(partner),
      avatar,
      groupAvatar,
      createdByUserId: conversation.createdByUserId,
      isCreator: conversation.createdByUserId === user._id,
      deleteAt: conversation.deleteAt ?? null,
      dmOtherLeft,
      dmPartner: partner ? { _id: partner._id, name: memberDisplay(partner) } : null,
      myLastReadAt: myMembership.lastReadAt,
      pinned: !!myMembership.pinnedAt,
      archived: !!myMembership.archivedAt,
      muted: !!myMembership.mutedAt,
      members: await Promise.all(
        memberUsers.map(async (u) => {
          const membership = members.find((m) => m.userId === u._id);
          const pres = await ctx.db
            .query("presence")
            .withIndex("by_user", (q) => q.eq("userId", u._id))
            .unique();
          return {
            _id: u._id,
            name: memberDisplay(u),
            avatar: await userAvatar(ctx, u),
            role: u.role,
            isCreator: conversation.createdByUserId === u._id,
            memberRole: membership?.role ?? "member",
            lastActiveAt: pres?.lastActiveAt ?? u.lastSeenAt ?? null,
          };
        }),
      ),
    };
  },
});

// --- Messages ----------------------------------------------------------------

function aggregateReactions(
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

export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { conversationId, paginationOpts }) => {
    const user = await requireUser(ctx);
    // Reactive query: don't throw on a stale link (left/deleted mid-session) —
    // the UI already shows a graceful state via getConversation's status.
    const membership = await getMembership(ctx, conversationId, user._id);
    if (!membership) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .paginate(paginationOpts);

    // Members + their read cursors, for per-message "seen by".
    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    const memberNames = new Map<Id<"users">, string>();
    const memberAvatars = new Map<Id<"users">, string | null>();
    await Promise.all(
      members.map(async (mb) => {
        const u = await ctx.db.get(mb.userId);
        memberNames.set(mb.userId, memberDisplay(u));
        memberAvatars.set(mb.userId, await userAvatar(ctx, u));
      }),
    );

    const items = await Promise.all(
      page.page.map(async (m) => {
        const sender = await ctx.db.get(m.senderUserId);
        const reactionRows = await ctx.db
          .query("messageReactions")
          .withIndex("by_message", (q) => q.eq("messageId", m._id))
          .collect();
        // Members (excluding the sender) whose read cursor is at/after this
        // message — i.e. who have seen it.
        const seenMembers = members.filter(
          (mb) => mb.userId !== m.senderUserId && mb.lastReadAt >= m.createdAt,
        );
        const seenBy = seenMembers.map((mb) => memberNames.get(mb.userId) ?? "Unknown");
        const seenByUsers = seenMembers.map((mb) => ({
          _id: mb.userId,
          name: memberNames.get(mb.userId) ?? "Unknown",
          avatar: memberAvatars.get(mb.userId) ?? null,
        }));

        // Compact quoted preview of the message being replied to.
        let replyTo: {
          _id: Id<"messages">;
          senderName: string;
          body: string;
          deleted: boolean;
        } | null = null;
        if (m.replyToId) {
          const parent = await ctx.db.get(m.replyToId);
          if (parent) {
            replyTo = {
              _id: parent._id,
              senderName: memberNames.get(parent.senderUserId) ?? "Unknown",
              body: parent.deletedAt ? "" : parent.body,
              deleted: !!parent.deletedAt,
            };
          }
        }

        return {
          _id: m._id,
          conversationId: m.conversationId,
          senderId: m.senderUserId,
          senderName: memberDisplay(sender),
          senderAvatar: memberAvatars.get(m.senderUserId) ?? null,
          body: m.deletedAt ? "" : m.body,
          deleted: !!m.deletedAt,
          edited: !!m.editedAt,
          attachments: m.deletedAt ? [] : await attachmentUrls(ctx, m.attachments),
          linkPreviews: m.deletedAt ? [] : m.linkPreviews,
          reactions: m.deletedAt ? [] : aggregateReactions(reactionRows, user._id),
          mentions: m.deletedAt ? [] : (m.mentions ?? []),
          replyTo,
          seenBy,
          seenByUsers,
          pinned: !m.deletedAt && !!m.pinnedAt,
          createdAt: m.createdAt,
        };
      }),
    );

    return { ...page, page: items };
  },
});

/** Messages in one conversation whose text contains `term`, newest first. */
export const searchMessages = query({
  args: { conversationId: v.id("conversations"), term: v.string() },
  handler: async (ctx, { conversationId, term }) => {
    const user = await requireUser(ctx);
    const needle = term.trim().toLowerCase();
    if (needle.length < 2 || !(await getMembership(ctx, conversationId, user._id))) return [];
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .take(3000);
    const hits = rows
      .filter((m) => !m.deletedAt && m.body.toLowerCase().includes(needle))
      .slice(0, 30);
    const names = new Map<Id<"users">, string>();
    for (const m of hits) {
      if (!names.has(m.senderUserId))
        names.set(m.senderUserId, memberDisplay(await ctx.db.get(m.senderUserId)));
    }
    return hits.map((m) => ({
      _id: m._id,
      body: m.body,
      senderName: names.get(m.senderUserId) ?? "Unknown",
      createdAt: m.createdAt,
    }));
  },
});

export const listPinnedMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    if (!(await getMembership(ctx, conversationId, user._id))) return [];
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation_pinnedAt", (q) =>
        q.eq("conversationId", conversationId).gt("pinnedAt", 0),
      )
      .order("desc")
      .take(50);
    return Promise.all(
      rows
        .filter((m) => !m.deletedAt)
        .map(async (m) => ({
          _id: m._id,
          body: m.body,
          hasAttachments: m.attachments.length > 0,
          senderName: memberDisplay(await ctx.db.get(m.senderUserId)),
          createdAt: m.createdAt,
        })),
    );
  },
});

export const togglePinMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const user = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.deletedAt) {
      throw new ConvexError({ code: "not_found", message: "Message not found" });
    }
    await requireMembership(ctx, message.conversationId, user._id);
    await ctx.db.patch(
      messageId,
      message.pinnedAt
        ? { pinnedAt: undefined, pinnedByUserId: undefined }
        : { pinnedAt: Date.now(), pinnedByUserId: user._id },
    );
    return { pinned: !message.pinnedAt };
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, { messageId, emoji }) => {
    const user = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.deletedAt) {
      throw new ConvexError({
        code: "not_found",
        message: "Message not found",
      });
    }
    await requireMembership(ctx, message.conversationId, user._id);

    // WhatsApp-style: one reaction per user per message.
    const existing = await ctx.db
      .query("messageReactions")
      .withIndex("by_message_user", (q) => q.eq("messageId", messageId).eq("userId", user._id))
      .first();

    if (existing) {
      if (existing.emoji === emoji) {
        await ctx.db.delete(existing._id); // toggle off
      } else {
        await ctx.db.patch(existing._id, { emoji, createdAt: Date.now() });
      }
    } else {
      await ctx.db.insert("messageReactions", {
        messageId,
        conversationId: message.conversationId,
        userId: user._id,
        emoji,
        createdAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const sendMessage = gatedMutation("chat")({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
    linkPreviews: v.optional(v.array(linkPreviewArg)),
    replyToId: v.optional(v.id("messages")),
    mentions: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const membership = await requireMembership(ctx, args.conversationId, user._id);

    const body = args.body.trim();
    const attachments = args.attachments ?? [];
    if (!body && attachments.length === 0) {
      throw new ConvexError({
        code: "bad_request",
        message: "Message cannot be empty",
      });
    }
    assertAttachmentSizeOk(attachments);

    // Only accept a reply target that belongs to this conversation.
    let replyToId: Id<"messages"> | undefined;
    if (args.replyToId) {
      const parent = await ctx.db.get(args.replyToId);
      if (parent && parent.conversationId === args.conversationId) {
        replyToId = parent._id;
      }
    }
    // Keep only mentions that are actually members of this conversation.
    const memberRows = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    const memberIds = new Set(memberRows.map((m) => m.userId));
    const mentions = (args.mentions ?? []).filter((id) => id !== user._id && memberIds.has(id));

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderUserId: user._id,
      body,
      attachments,
      linkPreviews: args.linkPreviews ?? [],
      ...(replyToId ? { replyToId } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      createdAt: now,
    });
    await Promise.all(
      attachments.map((a) =>
        ctx.db.insert("attachmentOwners", {
          storageId: a.storageId,
          kind: "message",
          conversationId: args.conversationId,
        }),
      ),
    );
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessagePreview: messagePreview(body, attachments.length),
    });
    // Sender has implicitly read their own message.
    await ctx.db.patch(membership._id, { lastReadAt: now, unreadCount: 0 });
    // Every other member is now one message further behind.
    await Promise.all(
      memberRows
        .filter((m) => m.userId !== user._id)
        .map((m) => ctx.db.patch(m._id, { unreadCount: (m.unreadCount ?? 0) + 1 })),
    );

    // Notify other members, unless they've muted this conversation.
    // @mentions get a distinct, more urgent notification; everyone else
    // still needs to hear about the message itself (this is what feeds
    // BrowserNotificationBridge — without a row here, a plain message
    // never surfaces an OS/browser notification for its recipients).
    {
      const conversation = await ctx.db.get(args.conversationId);
      const senderName = memberDisplay(user);
      const contextLabel =
        conversation?.type === "group" ? (conversation.name ?? "Group") : senderName;
      const muted = new Set(memberRows.filter((m) => m.mutedAt).map((m) => m.userId));
      const mentionSet = new Set(mentions);

      for (const uid of mentions) {
        if (muted.has(uid)) continue;
        await createNotification(ctx, {
          userId: uid,
          type: "chat-mention",
          title: `${senderName} mentioned you`,
          body: `${contextLabel}: ${body.slice(0, 120)}`,
          link: `/chat?c=${args.conversationId}`,
        });
      }

      const preview = messagePreview(body, attachments.length).slice(0, 120);
      for (const member of memberRows) {
        if (member.userId === user._id) continue;
        if (muted.has(member.userId)) continue;
        if (mentionSet.has(member.userId)) continue;
        await createNotification(ctx, {
          userId: member.userId,
          type: "chat-message",
          title: senderName,
          body: conversation?.type === "group" ? `${contextLabel}: ${preview}` : preview,
          link: `/chat?c=${args.conversationId}`,
        });
      }
    }
    return { messageId };
  },
});

export const editMessage = mutation({
  args: {
    messageId: v.id("messages"),
    body: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, { messageId, body, attachments }) => {
    const user = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.deletedAt) {
      throw new ConvexError({
        code: "not_found",
        message: "Message not found",
      });
    }
    if (message.senderUserId !== user._id) {
      throw new ConvexError({
        code: "forbidden",
        message: "You can only edit your own messages",
      });
    }
    const trimmedBody = body.trim();
    const nextAttachments = attachments ?? message.attachments;
    if (!trimmedBody && nextAttachments.length === 0) {
      throw new ConvexError({
        code: "bad_request",
        message: "Message cannot be empty",
      });
    }
    await ctx.db.patch(messageId, {
      body: trimmedBody,
      ...(attachments ? { attachments } : {}),
      editedAt: Date.now(),
    });
    // A newly-added attachment needs an index row too — canAccessFile's fast
    // path otherwise never finds it. Existing ones already have a row from
    // send; a harmless duplicate for those already covered.
    if (attachments) {
      await Promise.all(
        attachments.map((a) =>
          ctx.db.insert("attachmentOwners", {
            storageId: a.storageId,
            kind: "message",
            conversationId: message.conversationId,
          }),
        ),
      );
    }
    return { ok: true };
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const user = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.deletedAt) return { ok: false };
    if (!isOwnerOrAdmin(user, message.senderUserId)) {
      throw new ConvexError({
        code: "forbidden",
        message: "You can only delete your own messages",
      });
    }
    // Remove any stored attachments (images/files) from Convex storage.
    for (const attachment of message.attachments) {
      await ctx.storage.delete(attachment.storageId);
    }
    // Remove reactions on the deleted message.
    const reactions = await ctx.db
      .query("messageReactions")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .collect();
    await Promise.all(reactions.map((r) => ctx.db.delete(r._id)));
    await ctx.db.patch(messageId, {
      deletedAt: Date.now(),
      body: "",
      attachments: [],
      linkPreviews: [],
    });
    // If this was the conversation's most recent message, the sidebar
    // preview (denormalized onto the conversation row) needs to catch up —
    // matching what listConversations used to compute live by re-reading
    // `deletedAt` off the latest message every time.
    const conversation = await ctx.db.get(message.conversationId);
    if (conversation && conversation.lastMessageAt === message.createdAt) {
      await ctx.db.patch(message.conversationId, {
        lastMessagePreview: "Message deleted",
      });
    }
    return { ok: true };
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const membership = await getMembership(ctx, conversationId, user._id);
    if (membership) {
      await ctx.db.patch(membership._id, {
        lastReadAt: Date.now(),
        unreadCount: 0,
      });
    }
    return { ok: true };
  },
});

// --- Typing indicator --------------------------------------------------------

export const setTyping = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    await requireMembership(ctx, conversationId, user._id);
    const existing = await ctx.db
      .query("typing")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", user._id),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
    } else {
      await ctx.db.insert("typing", {
        conversationId,
        userId: user._id,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const whoIsTyping = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    // Reactive query — degrade gracefully instead of throwing on a stale link.
    const membership = await getMembership(ctx, conversationId, user._id);
    if (!membership) return [];
    const cutoff = Date.now() - TYPING_WINDOW_MS;
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    const active = rows.filter((r) => r.userId !== user._id && r.updatedAt > cutoff);
    const names = await Promise.all(
      active.map(async (r) => memberDisplay(await ctx.db.get(r.userId))),
    );
    return names;
  },
});

// --- Group management --------------------------------------------------------

export const renameGroup = mutation({
  args: { conversationId: v.id("conversations"), name: v.string() },
  handler: async (ctx, { conversationId, name }) => {
    const user = await requireUser(ctx);
    await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    requireGroup(conversation);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConvexError({
        code: "bad_request",
        message: "Group name cannot be empty",
      });
    }
    await ctx.db.patch(conversationId, { name: trimmed });
    return { ok: true };
  },
});

export const setGroupAvatar = mutation({
  args: {
    conversationId: v.id("conversations"),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { conversationId, avatarStorageId }) => {
    const user = await requireUser(ctx);
    await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    requireGroup(conversation);
    // Drop the previous photo from storage when it's replaced or removed.
    if (conversation!.avatarStorageId && conversation!.avatarStorageId !== avatarStorageId) {
      await ctx.storage.delete(conversation!.avatarStorageId);
    }
    await ctx.db.patch(conversationId, { avatarStorageId });
    return { ok: true };
  },
});

export const addGroupMembers = mutation({
  args: {
    conversationId: v.id("conversations"),
    memberIds: v.array(v.id("users")),
  },
  handler: async (ctx, { conversationId, memberIds }) => {
    const user = await requireUser(ctx);
    await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    requireGroup(conversation);

    const now = Date.now();
    const groupName = conversation!.name ?? "Group";
    for (const uid of new Set(memberIds)) {
      const already = await getMembership(ctx, conversationId, uid);
      if (already) continue;
      const target = await ctx.db.get(uid);
      if (!target || target.status !== "active") continue;
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: uid,
        role: "member",
        lastReadAt: 0,
        joinedAt: now,
      });
      await createNotification(ctx, {
        userId: uid,
        type: "chat-added",
        title: `${memberDisplay(user)} added you to ${groupName}`,
        link: `/chat?c=${conversationId}`,
      });
    }
    return { ok: true };
  },
});

export const removeGroupMember = mutation({
  args: { conversationId: v.id("conversations"), userId: v.id("users") },
  handler: async (ctx, { conversationId, userId }) => {
    const user = await requireUser(ctx);
    await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    requireGroup(conversation);
    // Only the creator may remove other people.
    if (conversation!.createdByUserId !== user._id) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the group creator can remove members",
      });
    }
    if (userId === conversation!.createdByUserId) {
      throw new ConvexError({
        code: "bad_request",
        message: "The group creator cannot be removed",
      });
    }
    const membership = await getMembership(ctx, conversationId, userId);
    if (membership) await ctx.db.delete(membership._id);
    return { ok: true };
  },
});

export const deleteGroup = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    requireGroup(conversation);
    if (conversation!.createdByUserId !== user._id) {
      throw new ConvexError({
        code: "forbidden",
        message: "Only the group creator can delete this group",
      });
    }
    await purgeConversation(ctx, conversationId);
    return { ok: true };
  },
});

// --- Leaving & DM re-invites -------------------------------------------------

export const leaveConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const membership = await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return { ok: true };

    await ctx.db.delete(membership._id);
    const remaining = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();

    if (remaining.length === 0) {
      // Nobody left — tear it down immediately.
      await purgeConversation(ctx, conversationId);
      return { ok: true, purged: true };
    }

    if (conversation.type === "dm") {
      // The remaining person keeps the history behind a "left" banner; the
      // chat auto-deletes in 48h unless they re-invite and the leaver rejoins.
      await ctx.db.patch(conversationId, {
        deleteAt: Date.now() + DM_GRACE_MS,
      });
    }
    return { ok: true };
  },
});

export const reinviteDm = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.type !== "dm") {
      throw new ConvexError({
        code: "bad_request",
        message: "Re-invite is only available for direct messages",
      });
    }
    const partnerId = dmPartnerId(conversation, user._id);
    if (!partnerId) {
      throw new ConvexError({ code: "not_found", message: "No one to invite" });
    }
    // Guard: only when the partner has actually left.
    const partnerMembership = await getMembership(ctx, conversationId, partnerId);
    if (partnerMembership) {
      throw new ConvexError({
        code: "bad_request",
        message: "This person is still in the chat",
      });
    }
    const partner = await ctx.db.get(partnerId);
    if (!partner || partner.status !== "active") {
      throw new ConvexError({
        code: "not_found",
        message: "This person is no longer available",
      });
    }

    await createNotification(ctx, {
      userId: partnerId,
      type: "chat-reinvite",
      title: `${memberDisplay(user)} wants to reconnect`,
      body: "Re-join the chat to keep your conversation.",
      link: `/chat?rejoin=${conversationId}`,
    });
    await ctx.scheduler.runAfter(0, internal.outbound.sendNotificationEmail, {
      kind: "chat-reinvite",
      to: partner.email,
      data: {
        inviterName: memberDisplay(user),
        conversationId,
      },
    });
    return { ok: true };
  },
});

export const rejoinDm = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.type !== "dm" || !conversation.dmKey) {
      throw new ConvexError({
        code: "not_found",
        message: "This chat is no longer available",
      });
    }
    // The signed-in user must be one of the two original DM participants.
    const ids = conversation.dmKey.split(":") as Id<"users">[];
    if (!ids.includes(user._id)) {
      throw new ConvexError({
        code: "forbidden",
        message: "This invite isn't for you",
      });
    }
    const existing = await getMembership(ctx, conversationId, user._id);
    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: user._id,
        role: "member",
        lastReadAt: now,
        joinedAt: now,
      });
    }
    // Cancel the pending deletion and let the other side know.
    await ctx.db.patch(conversationId, { deleteAt: undefined });
    const otherId = ids.find((id) => id !== user._id);
    if (otherId) {
      await createNotification(ctx, {
        userId: otherId,
        type: "chat-rejoined",
        title: `${memberDisplay(user)} re-joined the chat`,
        link: `/chat?c=${conversationId}`,
      });
    }
    return { ok: true, conversationId };
  },
});

// --- Per-user conversation controls ------------------------------------------

async function toggleTimestamp(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  field: "pinnedAt" | "archivedAt" | "mutedAt",
) {
  const user = await requireUser(ctx);
  const membership = await requireMembership(ctx, conversationId, user._id);
  await ctx.db.patch(membership._id, {
    [field]: membership[field] ? undefined : Date.now(),
  });
  return { ok: true };
}

export const togglePin = mutation({
  args: { conversationId: v.id("conversations") },
  handler: (ctx, { conversationId }) => toggleTimestamp(ctx, conversationId, "pinnedAt"),
});

export const toggleArchive = mutation({
  args: { conversationId: v.id("conversations") },
  handler: (ctx, { conversationId }) => toggleTimestamp(ctx, conversationId, "archivedAt"),
});

export const toggleMute = mutation({
  args: { conversationId: v.id("conversations") },
  handler: (ctx, { conversationId }) => toggleTimestamp(ctx, conversationId, "mutedAt"),
});

// --- Shared media ------------------------------------------------------------

export const listSharedMedia = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { conversationId, paginationOpts }) => {
    const user = await requireUser(ctx);
    // Reactive query — degrade gracefully instead of throwing on a stale link.
    const membership = await getMembership(ctx, conversationId, user._id);
    if (!membership) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .paginate(paginationOpts);

    const items = (
      await Promise.all(
        page.page
          .filter((m) => !m.deletedAt && m.attachments.length > 0)
          .map(async (m) => {
            const withUrls = await attachmentUrls(ctx, m.attachments);
            return withUrls.map((a) => ({
              messageId: m._id,
              createdAt: m.createdAt,
              ...a,
            }));
          }),
      )
    ).flat();

    return { ...page, page: items };
  },
});

// --- Scheduled cleanup -------------------------------------------------------

/** Purge DMs whose 48h grace window has elapsed without a rejoin. Driven by an
 *  hourly cron (see crons.ts). Only single-member (abandoned) DMs are removed. */
export const purgeExpiredDms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("conversations")
      .withIndex("by_deleteAt", (q) => q.gt("deleteAt", 0).lte("deleteAt", now))
      .collect();
    let purged = 0;
    for (const conversation of expired) {
      const members = await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
        .collect();
      // A rejoin restores two members; those are cleared below defensively.
      if (members.length >= 2) {
        await ctx.db.patch(conversation._id, { deleteAt: undefined });
        continue;
      }
      await purgeConversation(ctx, conversation._id);
      purged += 1;
    }
    return { purged };
  },
});
