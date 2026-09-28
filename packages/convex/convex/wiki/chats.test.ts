/**
 * The wiki chat's attachments: a chat only hands out the files it holds, to
 * the person it belongs to, and takes them with it when it's deleted.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const serverKey = "test-server-key";

describe("wiki chat files", () => {
  test("only the chat's own files, only for its owner, gone with the chat", async () => {
    const t = convexTest(schema, modules);
    const [mine, stranger] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["sealed"])),
      await ctx.storage.store(new Blob(["someone else's"])),
    ]);
    const { id } = await t.mutation(api.wiki.chats.create, {
      serverKey,
      clerkUserId: "user_alice",
      title: "t",
      messages: "m",
      addFiles: [mine],
    });

    const urls = await t.query(api.wiki.chats.fileUrls, {
      serverKey,
      clerkUserId: "user_alice",
      id,
      storageIds: [mine, stranger],
    });
    expect(Object.keys(urls)).toEqual([mine]);
    expect(
      await t.query(api.wiki.chats.fileUrls, {
        serverKey,
        clerkUserId: "user_bob",
        id,
        storageIds: [mine],
      }),
    ).toEqual({});

    await t.mutation(api.wiki.chats.remove, { serverKey, clerkUserId: "user_alice", id });
    expect(await t.run((ctx) => ctx.storage.getUrl(mine))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(stranger))).not.toBeNull();
  });
});
