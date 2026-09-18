import { sandboxedMutation as mutation } from "./lib/sandbox";
import { ConvexError, v } from "convex/values";

import { type Id } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";
import { assertServerKey } from "./lib/auth";

/**
 * Server-key gated CRUD for the Wiki AI assistant's per-user chat history.
 *
 * These are called exclusively by the Elysia API (api.advantisgroup.de), which
 * authenticates the Clerk session, encrypts the title + message blobs with a
 * server-held key, and passes the verified `clerkUserId`. The stored `title`
 * and `messages` fields are AES-256-GCM ciphertext — this layer never sees or
 * stores plaintext chat content.
 */
/** Load a chat and verify it belongs to the given user, or throw. */
async function ownedChat(ctx: MutationCtx, id: Id<"wikiChats">, clerkUserId: string) {
  const chat = await ctx.db.get(id);
  if (!chat || chat.clerkUserId !== clerkUserId) {
    throw new ConvexError({ code: "not_found", message: "Chat not found" });
  }
  return chat;
}

export const list = query({
  args: { serverKey: v.string(), clerkUserId: v.string() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const chats = await ctx.db
      .query("wikiChats")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();
    return chats
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({
        id: c._id,
        title: c.title,
        messages: c.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
  },
});

export const get = query({
  args: { serverKey: v.string(), clerkUserId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const id = ctx.db.normalizeId("wikiChats", args.id);
    const chat = id ? await ctx.db.get(id) : null;
    if (!chat || chat.clerkUserId !== args.clerkUserId) return null;
    return { id: chat._id, title: chat.title, messages: chat.messages };
  },
});

export const create = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    title: v.string(),
    messages: v.string(),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const now = Date.now();
    const id = await ctx.db.insert("wikiChats", {
      clerkUserId: args.clerkUserId,
      title: args.title,
      messages: args.messages,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const update = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    id: v.id("wikiChats"),
    title: v.optional(v.string()),
    messages: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    await ownedChat(ctx, args.id, args.clerkUserId);
    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.messages !== undefined ? { messages: args.messages } : {}),
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

export const remove = mutation({
  args: {
    serverKey: v.string(),
    clerkUserId: v.string(),
    id: v.id("wikiChats"),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    await ownedChat(ctx, args.id, args.clerkUserId);
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});
