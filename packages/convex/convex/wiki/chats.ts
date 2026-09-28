import { serverMutation, serverQuery } from "../functions";
import { ConvexError, v } from "convex/values";

import { type Id } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";

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

export const list = serverQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
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
        pinnedAt: c.pinnedAt ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
  },
});

export const get = serverQuery({
  args: { clerkUserId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("wikiChats", args.id);
    const chat = id ? await ctx.db.get(id) : null;
    if (!chat || chat.clerkUserId !== args.clerkUserId) return null;
    return { id: chat._id, title: chat.title, messages: chat.messages };
  },
});

export const create = serverMutation({
  args: {
    clerkUserId: v.string(),
    title: v.string(),
    messages: v.string(),
    addFiles: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("wikiChats", {
      clerkUserId: args.clerkUserId,
      title: args.title,
      messages: args.messages,
      ...(args.addFiles?.length ? { files: args.addFiles } : {}),
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const update = serverMutation({
  args: {
    clerkUserId: v.string(),
    id: v.id("wikiChats"),
    title: v.optional(v.string()),
    messages: v.optional(v.string()),
    addFiles: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const chat = await ownedChat(ctx, args.id, args.clerkUserId);
    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.messages !== undefined ? { messages: args.messages } : {}),
      ...(args.addFiles?.length ? { files: [...(chat.files ?? []), ...args.addFiles] } : {}),
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/** Somewhere for the API to put a sealed attachment before it's sent. */
export const generateUploadUrl = serverMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/** Where to fetch a chat's attachments from — only files that chat holds. */
export const fileUrls = serverQuery({
  args: { clerkUserId: v.string(), id: v.id("wikiChats"), storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.id);
    if (!chat || chat.clerkUserId !== args.clerkUserId) return {};
    const held = new Set(chat.files ?? []);
    const urls: Record<string, string> = {};
    for (const storageId of args.storageIds) {
      const url = held.has(storageId) ? await ctx.storage.getUrl(storageId) : null;
      if (url) urls[storageId] = url;
    }
    return urls;
  },
});

/** Pinning leaves `updatedAt` alone — it isn't activity in the chat. */
export const setPinned = serverMutation({
  args: {
    clerkUserId: v.string(),
    id: v.id("wikiChats"),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ownedChat(ctx, args.id, args.clerkUserId);
    await ctx.db.patch(args.id, { pinnedAt: args.pinned ? Date.now() : undefined });
    return { updated: true };
  },
});

export const remove = serverMutation({
  args: {
    clerkUserId: v.string(),
    id: v.id("wikiChats"),
  },
  handler: async (ctx, args) => {
    const chat = await ownedChat(ctx, args.id, args.clerkUserId);
    for (const storageId of chat.files ?? []) await ctx.storage.delete(storageId);
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});
