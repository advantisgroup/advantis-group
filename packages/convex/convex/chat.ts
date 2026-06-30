import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const TYPING_WINDOW_MS = 6000;

const attachmentArg = v.object({
  storageId: v.id("_storage"),
  kind: v.union(v.literal("image"), v.literal("file")),
  name: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  size: v.optional(v.number()),
  contentType: v.optional(v.string()),
});

const linkPreviewArg = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  siteName: v.optional(v.string()),
});

function memberDisplay(user: Doc<"users"> | null): string {
  if (!user) return "Unknown";
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
  );
}

async function getMembership(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversationMembers"> | null> {
  return ctx.db
    .query("conversationMembers")
    .withIndex("by_user_conversation", q =>
      q.eq("userId", userId).eq("conversationId", conversationId)
    )
    .unique();
}

async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
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

async function attachmentUrls(
  ctx: QueryCtx,
  attachments: Doc<"messages">["attachments"]
) {
  return Promise.all(
    attachments.map(async a => ({
      ...a,
      url: await ctx.storage.getUrl(a.storageId),
    }))
  );
}

// --- Conversations -----------------------------------------------------------

export const listConversations = query({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();

    const rows = await Promise.all(
      memberships.map(async membership => {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation) return null;

        // Other members (for DM naming / group avatars).
        const allMembers = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", q =>
            q.eq("conversationId", conversation._id)
          )
          .collect();
        const others = (
          await Promise.all(
            allMembers
              .filter(m => m.userId !== user._id)
              .map(m => ctx.db.get(m.userId))
          )
        ).filter((u): u is Doc<"users"> => u !== null);

        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation", q =>
            q.eq("conversationId", conversation._id)
          )
          .order("desc")
          .first();

        // Unread = messages after my lastReadAt not sent by me.
        const recent = await ctx.db
          .query("messages")
          .withIndex("by_conversation", q =>
            q.eq("conversationId", conversation._id)
          )
          .order("desc")
          .take(50);
        const unread = recent.filter(
          m =>
            m.createdAt > membership.lastReadAt && m.senderUserId !== user._id
        ).length;

        const title =
          conversation.type === "group"
            ? (conversation.name ?? "Group")
            : memberDisplay(others[0] ?? null);

        const avatar =
          conversation.type === "dm" && others[0]
            ? others[0].avatarStorageId
              ? await ctx.storage.getUrl(others[0].avatarStorageId)
              : (others[0].avatarUrl ?? null)
            : null;

        return {
          _id: conversation._id,
          type: conversation.type,
          title,
          avatar,
          memberCount: allMembers.length,
          otherUserId:
            conversation.type === "dm" ? (others[0]?._id ?? null) : null,
          lastMessageAt: conversation.lastMessageAt,
          lastMessagePreview: lastMessage
            ? lastMessage.deletedAt
              ? "Message deleted"
              : lastMessage.body ||
                (lastMessage.attachments.length > 0 ? "📎 Attachment" : "")
            : "",
          unread,
        };
      })
    );

    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
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
          .withIndex("by_user", q => q.eq("userId", otherUserId))
          .collect()
      ).map(m => m.conversationId)
    );

    const mine = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .collect();
    const shared = mine.filter(m => theirConvIds.has(m.conversationId));

    const rows = await Promise.all(
      shared.map(async m => {
        const conversation = await ctx.db.get(m.conversationId);
        if (!conversation) return null;

        const members = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", q =>
            q.eq("conversationId", conversation._id)
          )
          .collect();

        const other =
          conversation.type === "dm"
            ? await ctx.db.get(otherUserId)
            : null;
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
            conversation.type === "group"
              ? (conversation.name ?? "Group")
              : memberDisplay(other),
          avatar,
          memberCount: members.length,
        };
      })
    );

    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.type === "dm" ? -1 : b.type === "dm" ? 1 : 0));
  },
});

export const getOrCreateDm = mutation({
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
      .withIndex("by_dmKey", q => q.eq("dmKey", key))
      .first();
    if (existing) return { conversationId: existing._id };

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

export const createGroup = mutation({
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
    await requireMembership(ctx, conversationId, user._id);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return null;
    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
      .collect();
    const memberUsers = (
      await Promise.all(members.map(m => ctx.db.get(m.userId)))
    ).filter((u): u is Doc<"users"> => u !== null);
    const others = memberUsers.filter(u => u._id !== user._id);
    const avatar =
      conversation.type === "dm" && others[0]
        ? others[0].avatarStorageId
          ? await ctx.storage.getUrl(others[0].avatarStorageId)
          : (others[0].avatarUrl ?? null)
        : null;
    return {
      _id: conversation._id,
      type: conversation.type,
      title:
        conversation.type === "group"
          ? (conversation.name ?? "Group")
          : memberDisplay(others[0] ?? null),
      avatar,
      members: await Promise.all(
        memberUsers.map(async u => {
          const pres = await ctx.db
            .query("presence")
            .withIndex("by_user", q => q.eq("userId", u._id))
            .unique();
          return {
            _id: u._id,
            name: memberDisplay(u),
            role: u.role,
            lastActiveAt: pres?.lastActiveAt ?? u.lastSeenAt ?? null,
          };
        })
      ),
    };
  },
});

// --- Messages ----------------------------------------------------------------

function aggregateReactions(
  rows: { emoji: string; userId: Id<"users"> }[],
  meId: Id<"users">
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
    await requireMembership(ctx, conversationId, user._id);

    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
      .order("desc")
      .paginate(paginationOpts);

    // Members + their read cursors, for per-message "seen by".
    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
      .collect();
    const memberNames = new Map<Id<"users">, string>();
    await Promise.all(
      members.map(async mb =>
        memberNames.set(mb.userId, memberDisplay(await ctx.db.get(mb.userId)))
      )
    );

    const items = await Promise.all(
      page.page.map(async m => {
        const sender = await ctx.db.get(m.senderUserId);
        const reactionRows = await ctx.db
          .query("messageReactions")
          .withIndex("by_message", q => q.eq("messageId", m._id))
          .collect();
        // Members (excluding the sender) whose read cursor is at/after this
        // message — i.e. who have seen it.
        const seenBy = members
          .filter(
            mb => mb.userId !== m.senderUserId && mb.lastReadAt >= m.createdAt
          )
          .map(mb => memberNames.get(mb.userId) ?? "Unknown");
        return {
          _id: m._id,
          conversationId: m.conversationId,
          senderId: m.senderUserId,
          senderName: memberDisplay(sender),
          body: m.deletedAt ? "" : m.body,
          deleted: !!m.deletedAt,
          edited: !!m.editedAt,
          attachments: m.deletedAt
            ? []
            : await attachmentUrls(ctx, m.attachments),
          linkPreviews: m.deletedAt ? [] : m.linkPreviews,
          reactions: m.deletedAt
            ? []
            : aggregateReactions(reactionRows, user._id),
          seenBy,
          createdAt: m.createdAt,
        };
      })
    );

    return { ...page, page: items };
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
      .withIndex("by_message_user", q =>
        q.eq("messageId", messageId).eq("userId", user._id)
      )
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

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    attachments: v.optional(v.array(attachmentArg)),
    linkPreviews: v.optional(v.array(linkPreviewArg)),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const membership = await requireMembership(
      ctx,
      args.conversationId,
      user._id
    );

    const body = args.body.trim();
    const attachments = args.attachments ?? [];
    if (!body && attachments.length === 0) {
      throw new ConvexError({
        code: "bad_request",
        message: "Message cannot be empty",
      });
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderUserId: user._id,
      body,
      attachments,
      linkPreviews: args.linkPreviews ?? [],
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, { lastMessageAt: now });
    // Sender has implicitly read their own message.
    await ctx.db.patch(membership._id, { lastReadAt: now });
    return { messageId };
  },
});

export const editMessage = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, { messageId, body }) => {
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
    await ctx.db.patch(messageId, { body: body.trim(), editedAt: Date.now() });
    return { ok: true };
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const user = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.deletedAt) return { ok: false };
    if (message.senderUserId !== user._id && user.role !== "admin") {
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
      .withIndex("by_message", q => q.eq("messageId", messageId))
      .collect();
    await Promise.all(reactions.map(r => ctx.db.delete(r._id)));
    await ctx.db.patch(messageId, {
      deletedAt: Date.now(),
      body: "",
      attachments: [],
      linkPreviews: [],
    });
    return { ok: true };
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const membership = await getMembership(ctx, conversationId, user._id);
    if (membership) {
      await ctx.db.patch(membership._id, { lastReadAt: Date.now() });
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
      .withIndex("by_conversation_user", q =>
        q.eq("conversationId", conversationId).eq("userId", user._id)
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
    await requireMembership(ctx, conversationId, user._id);
    const cutoff = Date.now() - TYPING_WINDOW_MS;
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
      .collect();
    const active = rows.filter(
      r => r.userId !== user._id && r.updatedAt > cutoff
    );
    const names = await Promise.all(
      active.map(async r => memberDisplay(await ctx.db.get(r.userId)))
    );
    return names;
  },
});
